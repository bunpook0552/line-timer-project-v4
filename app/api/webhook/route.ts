import { NextResponse, type NextRequest } from 'next/server';
import admin from 'firebase-admin';
import crypto from 'crypto';

// --- ส่วนเริ่มต้นการเชื่อมต่อ Firebase ---
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

// --- ส่วนกำหนดค่าเวลาของแต่ละเครื่อง (นาที) ---
const machineDurations: { [key: number]: number } = {
  1: 25, // เครื่องที่ 1 ใช้เวลา 25 นาที
  2: 25,
  3: 30,
  4: 45,
};
// --- สิ้นสุดส่วนกำหนดค่าเวลา ---

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

// Webhook จะรับคำขอแบบ POST จาก LINE
export async function POST(request: NextRequest) {
  try {
    const body = await request.text();
    const signature = request.headers.get('x-line-signature') || '';

    // 1. ตรวจสอบลายเซ็นเพื่อให้แน่ใจว่าคำขอมาจาก LINE จริงๆ
    const channelSecret = process.env.LINE_MESSAGING_CHANNEL_SECRET!;
    // เพิ่มการตรวจสอบว่า channelSecret ถูกตั้งค่าหรือไม่
    if (!channelSecret) {
      throw new Error("LINE_MESSAGING_CHANNEL_SECRET is not set in environment variables.");
    }

    const hash = crypto.createHmac('sha256', channelSecret).update(body).digest('base64');

    if (hash !== signature) {
      console.error("Signature validation failed!");
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const events = JSON.parse(body).events;
    // 2. ประมวลผลแต่ละ Event ที่ LINE ส่งมา
    for (const event of events) {
      if (event.type === 'message' && event.message.type === 'text') {
        const userId = event.source.userId;
        const userMessage = event.message.text.trim();
        const replyToken = event.replyToken;

        // 3. แปลงข้อความเป็นหมายเลขเครื่อง
        const machineId = parseInt(userMessage, 10);

        if (userId && !isNaN(machineId) && machineDurations[machineId]) {
          // ==========================================================
          // === ส่วนใหม่: ตรวจสอบว่าเครื่องไม่ว่างอยู่หรือเปล่า ===
          // ==========================================================
          const existingTimersQuery = await db.collection('timers')
            .where('machine_id', '==', machineId)
            .where('status', '==', 'pending')
            .limit(1)
            .get();

          if (!existingTimersQuery.empty) {
            // ถ้าเจอว่ามีคนใช้อยู่ (query ไม่ว่าง)
            await replyMessage(replyToken, `ขออภัยค่ะ 🙏\nเครื่องซักผ้าหมายเลข ${machineId} กำลังใช้งานอยู่ค่ะ`);
            return NextResponse.json({ status: "ok, machine is busy" }); // ไม่ต้องทำอะไรต่อ
          }
          // ==========================================================

          // ถ้าไม่เจอ (เครื่องว่าง) ก็ทำงานต่อไปตามปกติ
          const duration = machineDurations[machineId];
          const endTime = new Date(Date.now() + duration * 60 * 1000);

          // 4. บันทึกข้อมูลลง Firestore
          await db.collection('timers').add({
            user_id: userId,
            machine_id: machineId,
            end_time: endTime,
            status: 'pending',
          });

          // 5. ส่งข้อความตอบกลับเพื่อยืนยัน
          await replyMessage(replyToken, `รับทราบค่ะ! ✅\nเริ่มจับเวลา ${duration} นาทีสำหรับเครื่องหมายเลข ${machineId} แล้วค่ะ`);
        } else {
          // ถ้าข้อความที่พิมพ์มาไม่ถูกต้อง (ไม่ใช่ 1, 2, 3, 4)
          // นี่คือส่วนที่เราจะแก้ไขให้บอทแนะนำข้อมูลติดต่อร้านแทน
          const contactMessage = "ขออภัยค่ะ บอทสามารถตั้งเวลาได้จากตัวเลข 1-4 เท่านั้นค่ะ 🙏\n\nหากต้องการติดต่อเจ้าหน้าที่โดยตรง กรุณาติดต่อที่:\nโทร: 08x-xxx-xxxx\nหรือที่หน้าเคาน์เตอร์ได้เลยค่ะ";
          await replyMessage(replyToken, contactMessage);
        }
      }
    }
    return NextResponse.json({ status: "ok" });
  } catch (error) {
    console.error("Error in webhook handler:", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}