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
  } catch (e) { console.error("Firebase Admin initialization error", e); }
}
const db = admin.firestore();
// --- สิ้นสุดส่วนการเชื่อมต่อ ---

// === กำหนด ID ร้านค้า (สำหรับร้านแรก) ===
// ใช้ Store ID ที่คุณกำหนดใน Firebase Console Collection 'stores'
const STORE_ID = 'laundry_1'; 

// ฟังก์ชันสำหรับส่งข้อความตอบกลับไปหาผู้ใช้
async function replyMessage(replyToken: string, text: string) {
  const replyUrl = 'https://api.line.me/v2/bot/message/reply';
  const accessToken = process.env.LINE_MESSAGING_TOKEN!;
  const message = {
    replyToken: replyToken,
    messages: [{ type: 'text', text: text }],
  };
  const response = await fetch(replyUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
    },
    body: JSON.stringify(message),
  });
  if (!response.ok) {
    console.error("Failed to send reply message:", await response.json());
  }
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
      throw new Error("Signature validation failed!");
    }

    const events = JSON.parse(body).events;
    for (const event of events) {
      if (event.type === 'message' && event.message.type === 'text') {
        const userId = event.source.userId;
        const userMessage = event.message.text.trim();
        const replyToken = event.replyToken;
        const requestedMachineId = parseInt(userMessage, 10); // ID ที่ลูกค้าพิมพ์มา

        // === ดึงข้อมูลการตั้งค่าเครื่องจาก Firestore (ตาม Store ID) ===
        const machineConfigRef = db.collection('stores').doc(STORE_ID).collection('machine_configs');
        const machineConfigsSnapshot = await machineConfigRef.where('machine_id', '==', requestedMachineId).limit(1).get();

        if (machineConfigsSnapshot.empty) {
          // ถ้าไม่พบหมายเลขเครื่องที่ตรงกันในฐานข้อมูลสำหรับร้านนี้
          await replyMessage(replyToken, 'ขออภัยค่ะ ไม่พบหมายเลขเครื่องที่คุณระบุ กรุณาพิมพ์เฉพาะตัวเลขของเครื่องที่เปิดใช้งานค่ะ');
          return NextResponse.json({ status: "ok, machine not found" });
        }

        const machineConfigData = machineConfigsSnapshot.docs[0].data();
        const machineId = machineConfigData.machine_id;
        const duration = machineConfigData.duration_minutes;
        const machineType = machineConfigData.machine_type; // 'washer' or 'dryer'
        const displayName = machineConfigData.display_name;

        if (!machineConfigData.is_active) {
            // ถ้าเครื่องถูกตั้งค่าให้ "ปิดใช้งาน" ในหน้า Admin
            await replyMessage(replyToken, `ขออภัยค่ะ 🙏\nเครื่อง ${displayName} กำลังปิดใช้งานอยู่ค่ะ`);
            return NextResponse.json({ status: "ok, machine inactive" });
        }
        
        // === ตรวจสอบสถานะเครื่องว่าง/ไม่ว่าง ===
        // การเก็บ timers จะอยู่ภายใต้ Store ID
        const existingTimersQuery = await db.collection('stores').doc(STORE_ID).collection('timers')
          .where('machine_id', '==', machineId)
          .where('status', '==', 'pending')
          .get(); 

        if (!existingTimersQuery.empty) {
          // ถ้าเจอว่ามีคนใช้อยู่ (เครื่องไม่ว่าง)
          await replyMessage(replyToken, `ขออภัยค่ะ 🙏\nเครื่อง ${displayName} กำลังใช้งานอยู่ค่ะ`);
          return NextResponse.json({ status: "ok, machine is busy" });
        }

        // ถ้าเครื่องว่างและเปิดใช้งานอยู่: บันทึกข้อมูลลง Firestore
        const endTime = new Date(Date.now() + duration * 60 * 1000);

        // บันทึกข้อมูลลง Firestore (timers sub-collection ภายใต้ Store ID)
        await db.collection('stores').doc(STORE_ID).collection('timers').add({
          user_id: userId,
          machine_id: machineId,
          machine_type: machineType, 
          display_name: displayName, 
          duration_minutes: duration, 
          end_time: endTime,
          status: 'pending',
        });

        // ส่งข้อความตอบกลับเพื่อยืนยัน
        await replyMessage(replyToken, `รับทราบค่ะ! ✅\nเริ่มจับเวลา ${duration} นาทีสำหรับ ${displayName} แล้วค่ะ`);

      } else {
        // ถ้าข้อความที่พิมพ์มาไม่ถูกต้อง (ไม่ใช่ตัวเลขของเครื่องที่พบใน DB)
        const contactMessage = "ขออภัยค่ะ บอทสามารถตั้งเวลาได้จากตัวเลขของเครื่องเท่านั้นค่ะ 🙏\n\nหากต้องการติดต่อเจ้าหน้าที่โดยตรง กรุณาติดต่อที่:\nโทร: 08x-xxx-xxxx\nหรือที่หน้าเคาน์เตอร์ได้เลยค่ะ";
        await replyMessage(replyToken, contactMessage);
      }
    }
    return NextResponse.json({ status: "ok" });
  } catch (error) {
    console.error("Error in webhook handler:", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}