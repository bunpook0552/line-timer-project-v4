import { NextResponse, type NextRequest } from 'next/server';
import admin from 'firebase-admin';
import crypto from 'crypto';

// --- ส่วนเริ่มต้นการเชื่อมต่อ Firebase Admin SDK (สำหรับหลังบ้าน) ---
// ตรวจสอบว่ายังไม่มีการเชื่อมต่อ Firebase Admin เพื่อป้องกันการ initialize ซ้ำ
if (!admin.apps.length) {
  try {
    // แปลง Service Account JSON จาก Environment Variable
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

// --- กำหนด Type ที่ใช้ในโปรแกรม ---

// Type สำหรับ Quick Reply Action ของ LINE
interface QuickReplyAction {
  type: 'message';
  label: string;
  text: string;
}

// Type สำหรับ Quick Reply Item ของ LINE
interface QuickReplyItem {
  type: 'action';
  action: QuickReplyAction;
}

// --- ฟังก์ชันช่วยเหลือ (Helper Functions) ---

/**
 * ฟังก์ชันสำหรับส่งข้อความตอบกลับผ่าน LINE Messaging API
 * @param replyToken - Token สำหรับการตอบกลับ
 * @param text - ข้อความที่ต้องการส่ง
 * @param accessToken - Access Token ของ LINE Channel สำหรับร้านค้านั้นๆ
 * @param quickReplyItems - (Optional) ปุ่ม Quick Reply ที่จะแสดงให้ผู้ใช้เลือก
 */
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

  // เพิ่ม Quick Reply หากมี
  if (quickReplyItems && quickReplyItems.length > 0) {
    messagePayload.messages[0].quickReply = { items: quickReplyItems };
  }

  try {
    const response = await fetch(replyUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
      body: JSON.stringify(messagePayload),
    });

    if (!response.ok) {
      const errorBody = await response.json();
      console.error("Failed to send reply message:", JSON.stringify(errorBody));
    }
  } catch (error) {
      console.error("Error sending LINE reply:", error);
  }
}

/**
 * ฟังก์ชันสำหรับเริ่มจับเวลาและบันทึกลง Firestore
 * @param userId - LINE User ID
 * @param storeId - ID ของร้านค้าใน Firestore
 * @param machineType - ประเภทเครื่อง ('washer' หรือ 'dryer')
 * @param machineId - ID ของเครื่อง
 * @param duration - ระยะเวลา (นาที)
 * @param displayName - ชื่อที่แสดงผลของเครื่อง
 * @param replyToken - Token สำหรับการตอบกลับ
 * @param accessToken - Access Token ของ LINE Channel
 * @param messages - Map ของข้อความที่ดึงมาจาก Firestore
 */
async function startTimer(userId: string, storeId: string, machineType: 'washer' | 'dryer', machineId: number, duration: number, displayName: string, replyToken: string, accessToken: string, messages: Map<string, string>) {
  const endTime = new Date(Date.now() + duration * 60 * 1000);

  // ตรวจสอบสถานะเครื่องว่ากำลังทำงานอยู่หรือไม่
  const existingTimersQuery = await db.collection('stores').doc(storeId).collection('timers')
    .where('machine_id', '==', machineId)
    .where('machine_type', '==', machineType)
    .where('status', '==', 'pending')
    .get();

  // ถ้ามี Timer ที่ยัง pending อยู่ แสดงว่าเครื่องไม่ว่าง
  if (!existingTimersQuery.empty) {
    const busyMessage = messages.get('machine_busy')?.replace('{display_name}', displayName) || `ขออภัยค่ะ เครื่อง ${displayName} กำลังใช้งานอยู่ค่ะ`;
    await replyMessage(replyToken, busyMessage, accessToken);
    return;
  }

  // บันทึกข้อมูลการจับเวลาลง Firestore
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

  // ส่งข้อความยืนยันการเริ่มจับเวลา
  const confirmationMessage = messages.get('start_timer_confirmation')
    ?.replace('{duration}', String(duration))
    .replace('{display_name}', displayName) || `รับทราบค่ะ! เริ่มจับเวลา ${duration} นาทีสำหรับ ${displayName} แล้วค่ะ`;

  await replyMessage(replyToken, confirmationMessage, accessToken);
}


// --- Route Handler หลักสำหรับ Webhook ---
export async function POST(request: NextRequest) {
  let events: any[] = [];
  try {
    const bodyText = await request.text();
    const signature = request.headers.get('x-line-signature') || '';
    const channelSecret = process.env.LINE_MESSAGING_CHANNEL_SECRET;

    if (!channelSecret) {
      console.error("LINE_MESSAGING_CHANNEL_SECRET is not set.");
      return new NextResponse("Configuration error", { status: 500 });
    }

    // ตรวจสอบ Signature ของ LINE
    const hash = crypto.createHmac('sha256', channelSecret).update(bodyText).digest('base64');
    if (hash !== signature) {
      return new NextResponse("Signature validation failed!", { status: 401 });
    }

    events = JSON.parse(bodyText).events;

    for (const event of events) {
      // ข้าม event ที่ไม่ใช่ข้อความจาก user หรือมาจาก group/room
      if (event.type !== 'message' || event.message.type !== 'text' || !event.source || !event.source.userId) {
        continue;
      }
      
      const { replyToken } = event;
      const { userId } = event.source;
      const userMessage = event.message.text.trim();

      // --- ส่วนสำคัญ: ค้นหาร้านค้าจาก LINE Channel ID ---
      const channelIdFromLine = event.source.channelId;
      if (!channelIdFromLine) {
          console.error("Event is missing source.channelId");
          continue;
      }

      const storesQuery = await db.collection('stores').where('line_channel_id', '==', channelIdFromLine).limit(1).get();

      if (storesQuery.empty) {
        console.error(`Store not found for LINE Channel ID: ${channelIdFromLine}.`);
        // ไม่สามารถตอบกลับได้เพราะไม่รู้จะใช้ Token ไหน
        return new NextResponse("Store not configured", { status: 404 });
      }

      const storeDoc = storesQuery.docs[0];
      const storeId = storeDoc.id;
      const storeData = storeDoc.data();
      const currentStoreLineToken = storeData.line_access_token;

      if (!currentStoreLineToken) {
        console.error(`LINE Access Token missing for store: ${storeId}`);
        return new NextResponse("Store configuration error", { status: 500 });
      }
      
      // --- ดึงข้อความ Template ของร้านค้านั้นๆ จาก Firestore ---
      const messagesMap = new Map<string, string>();
      const templatesCol = db.collection('stores').doc(storeId).collection('message_templates');
      const snapshot = await templatesCol.get();
      
      // กำหนดข้อความ Default หากไม่พบใน Firestore
      const defaultMessages = {
          'initial_greeting': 'สวัสดีค่ะ ร้านซัก-อบ ยินดีต้อนรับ 🙏\n\n📢 กรุณาเลือกบริการที่ต้องการด้านล่างนี้ได้เลยค่ะ!',
          'start_timer_confirmation': 'รับทราบค่ะ! ✅\nเริ่มจับเวลา {duration} นาทีสำหรับ {display_name} แล้วค่ะ',
          'machine_busy': 'ขออภัยค่ะ 🙏\nเครื่อง {display_name} กำลังใช้งานอยู่ค่ะ',
          'machine_inactive': 'ขออภัยค่ะ 🙏\nเครื่อง {display_name} กำลังปิดใช้งานอยู่ค่ะ',
          'machine_not_found': 'ขออภัยค่ะ ไม่พบหมายเลขเครื่องที่คุณระบุ',
          'non_text_message': 'ขออภัยค่ะ บอทเข้าใจเฉพาะข้อความตัวอักษรเท่านั้น',
          'generic_error': 'ขออภัยค่ะ เกิดข้อผิดพลาดทางเทคนิค กรุณาลองใหม่อีกครั้ง',
          'select_washer_message': 'กรุณาเลือกหมายเลขเครื่องซักผ้าค่ะ',
          'no_washer_available_message': 'ขออภัยค่ะ ขณะนี้ไม่มีเครื่องซักผ้าว่าง',
          'select_dryer_message': 'กรุณาเลือกเวลาสำหรับเครื่องอบผ้าค่ะ',
          'no_dryer_available_message': 'ขออภัยค่ะ ขณะนี้ไม่มีเครื่องอบผ้าว่าง',
      };

      if (snapshot.empty) {
          console.warn(`No message templates found for store ${storeId}. Using default fallbacks.`);
          Object.entries(defaultMessages).forEach(([key, value]) => messagesMap.set(key, value));
      } else {
          // ใส่ Default ก่อน แล้วทับด้วยค่าจาก DB
          Object.entries(defaultMessages).forEach(([key, value]) => messagesMap.set(key, value));
          snapshot.forEach(doc => {
              messagesMap.set(doc.id, doc.data().text);
          });
      }
      
      // --- Logic การตอบโต้ตามข้อความจากผู้ใช้ ---

      // 1. ผู้ใช้เลือก "ซักผ้า"
      if (userMessage === "ซักผ้า") {
        const machineSnapshot = await db.collection('stores').doc(storeId).collection('machine_configs')
          .where('machine_type', '==', 'washer').where('is_active', '==', true).get();
        
        const washerButtons: QuickReplyItem[] = machineSnapshot.docs.map(doc => ({
          type: 'action',
          action: { type: 'message', label: `เครื่อง ${doc.data().machine_id}`, text: `ซักผ้า_เลือก_${doc.data().machine_id}` }
        }));

        if (washerButtons.length > 0) {
          await replyMessage(replyToken, messagesMap.get('select_washer_message')!, currentStoreLineToken, washerButtons);
        } else {
          await replyMessage(replyToken, messagesMap.get('no_washer_available_message')!, currentStoreLineToken);
        }

      // 2. ผู้ใช้เลือก "อบผ้า"
      } else if (userMessage === "อบผ้า") {
        const machineSnapshot = await db.collection('stores').doc(storeId).collection('machine_configs')
          .where('machine_type', '==', 'dryer').where('is_active', '==', true).get();
        
        const dryerButtons: QuickReplyItem[] = machineSnapshot.docs.map(doc => ({
          type: 'action',
          action: { type: 'message', label: `${doc.data().duration_minutes} นาที`, text: `อบผ้า_เลือก_${doc.data().machine_id}` }
        }));
        
        if (dryerButtons.length > 0) {
          await replyMessage(replyToken, messagesMap.get('select_dryer_message')!, currentStoreLineToken, dryerButtons);
        } else {
          await replyMessage(replyToken, messagesMap.get('no_dryer_available_message')!, currentStoreLineToken);
        }

      // 3. ผู้ใช้เลือกเครื่องซักผ้า
      } else if (userMessage.startsWith("ซักผ้า_เลือก_")) {
        const machineId = parseInt(userMessage.replace('ซักผ้า_เลือก_', ''), 10);
        const machineSnapshot = await db.collection('stores').doc(storeId).collection('machine_configs')
          .where('machine_id', '==', machineId).where('machine_type', '==', 'washer').limit(1).get();

        if (!machineSnapshot.empty) {
          const config = machineSnapshot.docs[0].data();
          if (config.is_active) {
            await startTimer(userId, storeId, 'washer', config.machine_id, config.duration_minutes, config.display_name, replyToken, currentStoreLineToken, messagesMap);
          } else {
            await replyMessage(replyToken, messagesMap.get('machine_inactive')!.replace('{display_name}', config.display_name), currentStoreLineToken);
          }
        } else {
          await replyMessage(replyToken, messagesMap.get('machine_not_found')!, currentStoreLineToken);
        }
      
      // 4. ผู้ใช้เลือกเครื่องอบผ้า
      } else if (userMessage.startsWith("อบผ้า_เลือก_")) {
        const machineId = parseInt(userMessage.replace('อบผ้า_เลือก_', ''), 10);
        const machineSnapshot = await db.collection('stores').doc(storeId).collection('machine_configs')
          .where('machine_id', '==', machineId).where('machine_type', '==', 'dryer').limit(1).get();

        if (!machineSnapshot.empty) {
          const config = machineSnapshot.docs[0].data();
          if (config.is_active) {
            await startTimer(userId, storeId, 'dryer', config.machine_id, config.duration_minutes, config.display_name, replyToken, currentStoreLineToken, messagesMap);
          } else {
            await replyMessage(replyToken, messagesMap.get('machine_inactive')!.replace('{display_name}', config.display_name), currentStoreLineToken);
          }
        } else {
          await replyMessage(replyToken, messagesMap.get('machine_not_found')!, currentStoreLineToken);
        }

      // 5. ข้อความเริ่มต้น หรืออื่นๆ
      } else {
        const initialButtons: QuickReplyItem[] = [
          { type: 'action', action: { type: 'message', label: 'ซักผ้า', text: 'ซักผ้า' } },
          { type: 'action', action: { type: 'message', label: 'อบผ้า', text: 'อบผ้า' } }
        ];
        await replyMessage(replyToken, messagesMap.get('initial_greeting')!, currentStoreLineToken, initialButtons);
      }
    }
    return NextResponse.json({ status: "ok" });

  } catch (error: unknown) {
    console.error("Error in webhook handler:", error);
    // กรณีเกิด Error ร้ายแรง ลองส่งข้อความแจ้งผู้ใช้ถ้าทำได้
    if (events.length > 0 && events[0].replyToken) {
        const fallbackAccessToken = process.env.LINE_MESSAGING_TOKEN; // ลองใช้ Token กลาง
        if (fallbackAccessToken) {
            await replyMessage(events[0].replyToken, 'ขออภัยค่ะ เกิดข้อผิดพลาดทางเทคนิค', fallbackAccessToken);
        }
    }
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
