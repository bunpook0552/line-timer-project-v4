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
  } catch (e: unknown) {
    console.error("Firebase Admin initialization error", e);
  }
}
const db = admin.firestore();
// --- สิ้นสุดส่วนการเชื่อมต่อ ---

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

// --- Type for Message Templates from Firestore ---
interface MessageTemplate {
  id: string; // The custom ID like 'initial_greeting'
  text: string;
}

// --- Global variable to store fetched messages ---
const messageTemplatesMap = new Map<string, string>();

// ฟังก์ชันสำหรับส่งข้อความตอบกลับพร้อมปุ่ม Quick Reply
// FIXED: เพิ่มพารามิเตอร์ accessToken เพื่อให้ใช้ Token ของแต่ละร้านได้
async function replyMessage(replyToken: string, text: string, accessToken: string, quickReplyItems?: QuickReplyItem[]) {
  const replyUrl = 'https://api.line.me/v2/bot/message/reply';

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
      'Authorization': `Bearer ${accessToken}`, // FIXED: ใช้ accessToken ที่ส่งเข้ามา
    },
    body: JSON.stringify(messagePayload),
  });
  if (!response.ok) {
    console.error("Failed to send reply message:", await response.json());
  }
}

// ฟังก์ชันสำหรับเริ่มจับเวลาและบันทึกลง DB
// FIXED: เพิ่มพารามิเตอร์ accessToken และ messagesMap
async function startTimer(userId: string, storeId: string, machineType: 'washer' | 'dryer', machineId: number, duration: number, displayName: string, replyToken: string, accessToken: string, messagesMap: Map<string, string>) {
    const endTime = new Date(Date.now() + duration * 60 * 1000);

    const existingTimersQuery = await db.collection('stores').doc(storeId).collection('timers')
        .where('machine_id', '==', machineId)
        .where('machine_type', '==', machineType)
        .where('status', '==', 'pending')
        .get();

    if (!existingTimersQuery.empty) {
        await replyMessage(replyToken, messagesMap.get('machine_busy')?.replace('{display_name}', displayName) || 'เครื่องกำลังใช้งานอยู่', accessToken);
        return;
    }

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

    await replyMessage(replyToken,
        messagesMap.get('start_timer_confirmation')
        ?.replace('{duration}', String(duration))
        .replace('{display_name}', displayName) || 'รับทราบค่ะ! เริ่มจับเวลาแล้ว', accessToken);
}


export async function POST(request: NextRequest) {
  try {
    const body = await request.text();
    const signature = request.headers.get('x-line-signature') || '';
    const channelSecretEnv = process.env.LINE_MESSAGING_CHANNEL_SECRET!;

    if (!channelSecretEnv) {
      console.error("LINE_MESSAGING_CHANNEL_SECRET is not set.");
      throw new Error("LINE_MESSAGING_CHANNEL_SECRET is not set in environment variables.");
    }

    const hash = crypto.createHmac('sha256', channelSecretEnv).update(body).digest('base64');
    if (hash !== signature) {
      return new NextResponse("Signature validation failed!", { status: 401 });
    }

    const events = JSON.parse(body).events;
    for (const event of events) {
        if (event.source && (event.source.type === 'group' || event.source.type === 'room')) {
            console.warn("Messages from group/room chat are not supported by this bot.");
            continue;
        }
        if (!event.source || !event.source.userId || !event.source.channelId) {
            console.error("Invalid LINE event source or missing user/channel ID.");
            continue;
        }

        const channelIdFromLine = event.source.channelId;
        const storesQuery = await db.collection('stores')
            .where('line_channel_id', '==', channelIdFromLine)
            .limit(1)
            .get();

        if (storesQuery.empty) {
            console.error(`Store not found for LINE Channel ID: ${channelIdFromLine}.`);
            return new NextResponse("Store not configured for this LINE channel.", { status: 404 });
        }

        const storeData = storesQuery.docs[0].data();
        const storeId = storesQuery.docs[0].id;
        const currentStoreLineToken = storeData.line_access_token;

        if (!currentStoreLineToken) {
            console.error(`LINE Access Token missing for store: ${storeId}`);
            throw new Error("LINE Access Token is missing for the identified store.");
        }
        
        // FIXED: เปลี่ยนชื่อตัวแปรให้ถูกต้องเป็น messageTemplatesMap
        messageTemplatesMap.clear(); // Clear map for each request to ensure fresh messages
        const messagesSnapshot = await db.collection('stores').doc(storeId).collection('message_templates').get();
        if (messagesSnapshot.empty) {
            console.warn(`No message templates found for store ${storeId}. Using default fallbacks.`);
            // Fallback to basic default messages if nothing found in DB
            messageTemplatesMap.set('initial_greeting', 'สวัสดีค่ะ ร้านซัก-อบ ยินดีต้อนรับ 🙏\n\n📢 กรุณาเลือกบริการที่ต้องการด้านล่างนี้ได้เลยค่ะ!');
            messageTemplatesMap.set('start_timer_confirmation', 'รับทราบค่ะ! ✅\nเริ่มจับเวลา {duration} นาทีสำหรับ {display_name} แล้วค่ะ');
            messageTemplatesMap.set('machine_busy', 'ขออภัยค่ะ 🙏\nเครื่อง {display_name} กำลังใช้งานอยู่ค่ะ');
            messageTemplatesMap.set('machine_inactive', 'ขออภัยค่ะ 🙏\nเครื่อง {display_name} กำลังปิดใช้งานอยู่ค่ะ');
            messageTemplatesMap.set('machine_not_found', 'ขออภัยค่ะ ไม่พบหมายเลขเครื่องที่คุณระบุ กรุณาพิมพ์เฉพาะตัวเลขของเครื่องที่เปิดใช้งานค่ะ');
        } else {
            // FIXED: เพิ่มโค้ดที่ขาดหายไปสำหรับวนลูปใส่ข้อมูลลง Map
            messagesSnapshot.forEach(doc => {
                const data = doc.data() as MessageTemplate;
                if (data.id && data.text) {
                    messageTemplatesMap.set(data.id, data.text);
                }
            });
            console.log(`Fetched ${messageTemplatesMap.size} message templates for store ${storeId}.`);
        }

        if (event.type === 'message' && event.message.type === 'text') {
            const userId = event.source.userId;
            const userMessage = event.message.text.trim().toLowerCase();
            const replyToken = event.replyToken;

            console.log("--- WEBHOOK DEBUG LOG ---");
            console.log("Received message:", userMessage);
            console.log("Identified STORE_ID:", storeId);
            console.log("Greeting message:", messageTemplatesMap.get('initial_greeting')); // For debugging
            // --- DEBUG LOG END ---

            if (userMessage === "ซักผ้า") {
                const machineConfigsCol = db.collection('stores').doc(storeId).collection('machine_configs');
                const q = machineConfigsCol.where('machine_type', '==', 'washer').where('is_active', '==', true);
                const machineSnapshot = await q.get();

                const washerButtons: QuickReplyItem[] = machineSnapshot.docs.map(doc => {
                    const data = doc.data();
                    return { type: 'action', action: { type: 'message', label: `เครื่อง ${data.machine_id}`, text: `ซักผ้า_เลือก_${data.machine_id}` } };
                });

                if (washerButtons.length > 0) {
                    await replyMessage(replyToken, messageTemplatesMap.get('select_washer_message') || 'กรุณาเลือกหมายเลขเครื่องซักผ้าค่ะ', currentStoreLineToken, washerButtons);
                } else {
                    await replyMessage(replyToken, messageTemplatesMap.get('no_washer_available_message') || 'ขออภัยค่ะ ขณะนี้ไม่มีเครื่องซักผ้าว่าง', currentStoreLineToken);
                }

            } else if (userMessage === "อบผ้า") {
                const machineConfigsCol = db.collection('stores').doc(storeId).collection('machine_configs');
                const q = machineConfigsCol.where('machine_type', '==', 'dryer').where('is_active', '==', true);
                const machineSnapshot = await q.get();

                const dryerButtons: QuickReplyItem[] = machineSnapshot.docs.map(doc => {
                    const data = doc.data();
                    return { type: 'action', action: { type: 'message', label: `${data.duration_minutes} นาที`, text: `อบผ้า_เลือก_${data.machine_id}` } };
                });

                if (dryerButtons.length > 0) {
                    await replyMessage(replyToken, messageTemplatesMap.get('select_dryer_message') || 'กรุณาเลือกเวลาสำหรับเครื่องอบผ้าค่ะ', currentStoreLineToken, dryerButtons);
                } else {
                    await replyMessage(replyToken, messageTemplatesMap.get('no_dryer_available_message') || 'ขออภัยค่ะ ขณะนี้ไม่มีเครื่องอบผ้าว่าง', currentStoreLineToken);
                }
            }
            else if (userMessage.startsWith("ซักผ้า_เลือก_")) {
                const requestedMachineId = parseInt(userMessage.replace('ซักผ้า_เลือก_', ''), 10);
                if (!isNaN(requestedMachineId)) {
                    const machineConfigsCol = db.collection('stores').doc(storeId).collection('machine_configs');
                    const q = machineConfigsCol.where('machine_id', '==', requestedMachineId).where('machine_type', '==', 'washer').limit(1);
                    const machineSnapshot = await q.get();

                    if (!machineSnapshot.empty) {
                        const machineConfigData = machineSnapshot.docs[0].data();
                        if (machineConfigData.is_active) {
                            await startTimer(userId, storeId, 'washer', machineConfigData.machine_id, machineConfigData.duration_minutes, machineConfigData.display_name, replyToken, currentStoreLineToken, messageTemplatesMap);
                        } else {
                            await replyMessage(replyToken, messageTemplatesMap.get('machine_inactive')?.replace('{display_name}', machineConfigData.display_name) || 'เครื่องปิดใช้งานอยู่', currentStoreLineToken);
                        }
                    } else {
                        await replyMessage(replyToken, messageTemplatesMap.get('machine_not_found') || 'ไม่พบหมายเลขเครื่องซักผ้าที่คุณเลือก', currentStoreLineToken);
                    }
                } else {
                    await replyMessage(replyToken, messageTemplatesMap.get('machine_not_found') || 'ข้อมูลหมายเลขเครื่องซักผ้าไม่ถูกต้อง', currentStoreLineToken);
                }
            } else if (userMessage.startsWith("อบผ้า_เลือก_")) {
                const requestedMachineId = parseInt(userMessage.replace('อบผ้า_เลือก_', ''), 10);
                if (!isNaN(requestedMachineId)) {
                    const machineConfigsCol = db.collection('stores').doc(storeId).collection('machine_configs');
                    const q = machineConfigsCol.where('machine_id', '==', requestedMachineId).where('machine_type', '==', 'dryer').limit(1);
                    const machineSnapshot = await q.get();

                    if (!machineSnapshot.empty) {
                        const machineConfigData = machineSnapshot.docs[0].data();
                        if (machineConfigData.is_active) {
                            await startTimer(userId, storeId, 'dryer', machineConfigData.machine_id, machineConfigData.duration_minutes, machineConfigData.display_name, replyToken, currentStoreLineToken, messageTemplatesMap);
                        } else {
                            await replyMessage(replyToken, messageTemplatesMap.get('machine_inactive')?.replace('{display_name}', machineConfigData.display_name) || 'เครื่องปิดใช้งานอยู่', currentStoreLineToken);
                        }
                    } else {
                        await replyMessage(replyToken, messageTemplatesMap.get('machine_not_found') || 'ไม่พบเครื่องอบผ้าที่คุณเลือก', currentStoreLineToken);
                    }
                } else {
                    await replyMessage(replyToken, messageTemplatesMap.get('machine_not_found') || 'ข้อมูลเครื่องอบผ้าไม่ถูกต้อง', currentStoreLineToken);
                }
            }
            else {
                const initialButtons: QuickReplyItem[] = [
                    { type: 'action', action: { type: 'message', label: 'ซักผ้า', text: 'ซักผ้า' } },
                    { type: 'action', action: { type: 'message', label: 'อบผ้า', text: 'อบผ้า' } }
                ];
                await replyMessage(replyToken, messageTemplatesMap.get('initial_greeting') || 'สวัสดีค่ะ กรุณาเลือกบริการที่ต้องการค่ะ', currentStoreLineToken, initialButtons);
            }
        } else {
            if (event.replyToken) {
                await replyMessage(event.replyToken, messageTemplatesMap.get('non_text_message') || 'ขออภัยค่ะ บอทเข้าใจเฉพาะข้อความตัวอักษรเท่านั้น', currentStoreLineToken);
            }
        }
    }
    return NextResponse.json({ status: "ok" });
  } catch (error: unknown) {
      console.error("Error in webhook handler:", error);
      // In case of any unexpected error, try to reply a generic message
      // A more robust way to get replyToken in case of early failure
      const bodyForToken = await request.json().catch(() => ({ events: [] }));
      const fallbackReplyToken = bodyForToken?.events?.[0]?.replyToken;
      const fallbackAccessToken = process.env.LINE_MESSAGING_TOKEN;

      if (fallbackReplyToken && fallbackAccessToken) {
          // Here we use the global map as a last resort because store-specific fetch might have failed
          await replyMessage(fallbackReplyToken, messageTemplatesMap.get('generic_error') || 'ขออภัยค่ะ เกิดข้อผิดพลาดทางเทคนิค กรุณาลองใหม่อีกครั้ง', fallbackAccessToken);
      }
      return new NextResponse("Internal Server Error", { status: 500 });
  }
} // FIXED: เพิ่มวงเล็บปีกกาปิด `}` ที่ขาดไปสำหรับฟังก์ชัน POST