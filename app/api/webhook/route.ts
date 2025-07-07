import { NextResponse, type NextRequest } from 'next/server';
import admin from 'firebase-admin';
import crypto from 'crypto';

// --- ส่วนเริ่มต้นการเชื่อมต่อ Firebase Admin SDK (สำหรับหลังบ้าน) ---
if (!admin.apps.length) {
  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT!);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
  } catch (e: unknown) { // แก้ไข: ระบุประเภท unknown สำหรับ catch error
    console.error("Firebase Admin initialization error", e);
  }
}
const db = admin.firestore();
// --- สิ้นสุดส่วนการเชื่อมต่อ ---

// === กำหนด ID ร้านค้า (สำหรับร้านแรก) ===
const STORE_ID = 'laundry_1';

// กำหนด Type สำหรับ Quick Reply Item เพื่อความถูกต้องของ TypeScript
interface QuickReplyAction {
  type: 'message';
  label: string;
  text: string;
}

interface QuickReplyItem {
  type: 'action';
  action: QuickReplyAction;
}

// ฟังก์ชันสำหรับส่งข้อความตอบกลับพร้อมปุ่ม Quick Reply
async function replyMessage(replyToken: string, text: string, quickReplyItems?: QuickReplyItem[]) {
  const replyUrl = 'https://api.line.me/v2/bot/message/reply';
  const accessToken = process.env.LINE_MESSAGING_TOKEN!;

  const messagePayload: {
    replyToken: string;
    messages: Array<{
      type: 'text';
      text: string;
      quickReply?: { items: QuickReplyItem[] };
    }>;
  } = {
    replyToken: replyToken,
    messages: [{ type: 'text', text: text }],
  };

  if (quickReplyItems && quickReplyItems.length > 0) {
    messagePayload.messages[0].quickReply = { items: quickReplyItems };
  }

  const response = await fetch(replyUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
    },
    body: JSON.stringify(messagePayload),
  });
  if (!response.ok) {
    console.error("Failed to send reply message:", await response.json());
  }
}

// ฟังก์ชันสำหรับเริ่มจับเวลาและบันทึกลง DB
async function startTimer(userId: string, storeId: string, machineType: 'washer' | 'dryer', machineId: number, duration: number, displayName: string, replyToken: string) {
    const endTime = new Date(Date.now() + duration * 60 * 1000);

    // === ตรวจสอบสถานะเครื่องว่าง/ไม่ว่าง ก่อนบันทึก ===
    const existingTimersQuery = await db.collection('stores').doc(storeId).collection('timers')
        .where('machine_id', '==', machineId)
        .where('machine_type', '==', machineType)
        .where('status', '==', 'pending')
        .get();

    if (!existingTimersQuery.empty) {
        await replyMessage(replyToken, `ขออภัยค่ะ 🙏\nเครื่อง ${displayName} กำลังใช้งานอยู่ค่ะ`);
        return;
    }

    // บันทึกข้อมูลลง Firestore (timers sub-collection ภายใต้ Store ID)
    await db.collection('stores').doc(storeId).collection('timers').add({
        user_id: userId,
        machine_id: machineId,
        machine_type: machineType,
        display_name: displayName,
        duration_minutes: duration,
        end_time: admin.firestore.Timestamp.fromDate(endTime),
        status: 'pending',
        created_at: admin.firestore.FieldValue.serverTimestamp(),
    });

    await replyMessage(replyToken, `รับทราบค่ะ! ✅\nเริ่มจับเวลา ${duration} นาทีสำหรับ ${displayName} แล้วค่ะ`);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.text();
    const signature = request.headers.get('x-line-signature') || '';
    const channelSecret = process.env.LINE_MESSAGING_CHANNEL_SECRET!;

    if (!channelSecret) {
      throw new Error("LINE_MESSAGING_CHANNEL_SECRET is not set in environment variables.");
    }

    const hash = crypto.createHmac('sha256', channelSecret).update(body).digest('base64');
    if (hash !== signature) {
      return new NextResponse("Signature validation failed!", { status: 401 });
    }

    const events = JSON.parse(body).events;
    for (const event of events) {
      if (event.type === 'message' && event.message.type === 'text' && event.source.userId) {
        const userId = event.source.userId;
        const userMessage = event.message.text.trim().toLowerCase();
        const replyToken = event.replyToken;

        // --- DEBUG LOG START ---
        console.log("--- WEBHOOK DEBUG LOG ---");
        console.log("Received message:", userMessage);
        console.log("Using STORE_ID:", STORE_ID);
        // --- DEBUG LOG END ---

        // === LOGIC ใหม่: ตรวจสอบข้อความที่เข้ามา ===
        // ขั้นตอนที่ 1: ลูกค้าเลือกประเภท (ซักผ้า/อบผ้า)
        if (userMessage === "ซักผ้า") {
            const machineConfigsCol = db.collection('stores').doc(STORE_ID).collection('machine_configs');
            const q = machineConfigsCol.where('machine_type', '==', 'washer').where('is_active', '==', true);
            const machineSnapshot = await q.get();

            const washerButtons: QuickReplyItem[] = machineSnapshot.docs.map(doc => {
                const data = doc.data();
                return {
                    type: 'action',
                    action: { type: 'message', label: `เครื่อง ${data.machine_id}`, text: `ซักผ้า_เลือก_${data.machine_id}` }
                };
            });

            if (washerButtons.length > 0) {
                await replyMessage(replyToken, 'กรุณาเลือกหมายเลขเครื่องซักผ้าค่ะ', washerButtons);
            } else {
                await replyMessage(replyToken, 'ขออภัยค่ะ ขณะนี้ไม่มีเครื่องซักผ้าว่าง');
            }

        } else if (userMessage === "อบผ้า") {
            const machineConfigsCol = db.collection('stores').doc(STORE_ID).collection('machine_configs');
            const q = machineConfigsCol.where('machine_type', '==', 'dryer').where('is_active', '==', true);
            const machineSnapshot = await q.get();

            const dryerButtons: QuickReplyItem[] = machineSnapshot.docs.map(doc => {
                const data = doc.data();
                return {
                    type: 'action',
                    action: { type: 'message', label: `${data.duration_minutes} นาที`, text: `อบผ้า_เลือก_${data.machine_id}` }
                };
            });

            if (dryerButtons.length > 0) {
                await replyMessage(replyToken, 'กรุณาเลือกเวลาสำหรับเครื่องอบผ้าค่ะ', dryerButtons);
            } else {
                await replyMessage(replyToken, 'ขออภัยค่ะ ขณะนี้ไม่มีเครื่องอบผ้าว่าง');
            }
        }
        // ขั้นตอนที่ 2: ลูกค้าเลือกหมายเลขเครื่อง
        else if (userMessage.startsWith("ซักผ้า_เลือก_")) {
            const requestedMachineId = parseInt(userMessage.replace('ซักผ้า_เลือก_', ''), 10);
            if (!isNaN(requestedMachineId)) {
                const machineConfigsCol = db.collection('stores').doc(STORE_ID).collection('machine_configs');
                const q = machineConfigsCol.where('machine_id', '==', requestedMachineId).where('machine_type', '==', 'washer').limit(1);
                const machineSnapshot = await q.get();

                if (!machineSnapshot.empty) {
                    const machineConfigData = machineSnapshot.docs[0].data();
                    if (machineConfigData.is_active) {
                        await startTimer(userId, STORE_ID, 'washer', machineConfigData.machine_id, machineConfigData.duration_minutes, machineConfigData.display_name, replyToken);
                    } else {
                        await replyMessage(replyToken, `ขออภัยค่ะ 🙏\nเครื่อง ${machineConfigData.display_name} กำลังปิดใช้งานอยู่ค่ะ`);
                    }
                } else {
                    await replyMessage(replyToken, 'ไม่พบหมายเลขเครื่องซักผ้าที่คุณเลือก');
                }
            } else {
                await replyMessage(replyToken, 'ข้อมูลหมายเลขเครื่องซักผ้าไม่ถูกต้อง');
            }
        } else if (userMessage.startsWith("อบผ้า_เลือก_")) {
            const requestedMachineId = parseInt(userMessage.replace('อบผ้า_เลือก_', ''), 10); // สำหรับเครื่องอบผ้า machine_id คือ duration (40, 50, 60)
            if (!isNaN(requestedMachineId)) {
                const machineConfigsCol = db.collection('stores').doc(STORE_ID).collection('machine_configs');
                const q = machineConfigsCol.where('machine_id', '==', requestedMachineId).where('machine_type', '==', 'dryer').limit(1);
                const machineSnapshot = await q.get();

                if (!machineSnapshot.empty) {
                    const machineConfigData = machineSnapshot.docs[0].data();
                    if (machineConfigData.is_active) {
                        await startTimer(userId, STORE_ID, 'dryer', machineConfigData.machine_id, machineConfigData.duration_minutes, machineConfigData.display_name, replyToken);
                    } else {
                         await replyMessage(replyToken, `ขออภัยค่ะ 🙏\nเครื่อง ${machineConfigData.display_name} กำลังปิดใช้งานอยู่ค่ะ`);
                    }
                } else {
                    await replyMessage(replyToken, 'ไม่พบเครื่องอบผ้าที่คุณเลือก');
                }
            } else {
                await replyMessage(replyToken, 'ข้อมูลเครื่องอบผ้าไม่ถูกต้อง');
            }
        }
        // ขั้นตอนที่ 0: ข้อความทักทายครั้งแรก หรือข้อความที่ไม่รู้จัก
        else {
            const initialButtons: QuickReplyItem[] = [
                { type: 'action', action: { type: 'message', label: 'ซักผ้า', text: 'ซักผ้า' } },
                { type: 'action', action: { type: 'message', label: 'อบผ้า', text: 'อบผ้า' } }
            ];
            await replyMessage(replyToken, 'สวัสดีค่ะ ร้านซัก-อบ ยินดีต้อนรับ 🙏\nกรุณาเลือกบริการที่ต้องการค่ะ', initialButtons);
        }
      } else { // Handle non-text messages (e.g., sticker, image)
        if (event.replyToken) {
            await replyMessage(event.replyToken, 'ขออภัยค่ะ บอทเข้าใจเฉพาะข้อความตัวอักษรเท่านั้น');
        }
      }
    }
    return NextResponse.json({ status: "ok" });
  } catch (error: unknown) { // แก้ไข: ระบุประเภท unknown สำหรับ catch error
    console.error("Error in webhook handler:", error);
    // In case of any unexpected error, try to reply a generic message
    const fallbackReplyToken = (request.body as { events?: { replyToken?: string }[] })?.events?.[0]?.replyToken;
    if (fallbackReplyToken) {
        await replyMessage(fallbackReplyToken, 'ขออภัยค่ะ เกิดข้อผิดพลาดทางเทคนิค กรุณาลองใหม่อีกครั้ง');
    }
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}