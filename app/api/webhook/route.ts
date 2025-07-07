import { NextResponse, type NextRequest } from 'next/server';
import admin from 'firebase-admin';
import crypto from 'crypto';

// --- Firebase Admin SDK ---
if (!admin.apps.length) {
  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT!);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
  } catch (e) {
    console.error("Firebase Admin initialization error", e);
  }
}
const db = admin.firestore();
const STORE_ID = 'laundry_1';

// ---- กำหนด type ที่จำเป็น ----
interface QuickReplyItem {
  type: string;
  action: {
    type: string;
    label: string;
    text: string;
  };
}

interface Message {
  type: string;
  text?: string;
  quickReply?: {
    items: QuickReplyItem[];
  };
}

// ฟังก์ชันสำหรับส่งข้อความตอบกลับพร้อมปุ่ม Quick Reply
async function replyMessage(
  replyToken: string,
  text: string,
  quickReplyItems?: QuickReplyItem[]
) {
  const replyUrl = 'https://api.line.me/v2/bot/message/reply';
  const accessToken = process.env.LINE_MESSAGING_TOKEN!;

  const messagePayload: { replyToken: string; messages: Message[] } = {
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
async function startTimer(
  userId: string,
  storeId: string,
  machineType: 'washer' | 'dryer',
  machineId: number,
  duration: number,
  displayName: string,
  replyToken: string
) {
  const endTime = new Date(Date.now() + duration * 60 * 1000);
  const existingTimersQuery = await db.collection('stores').doc(storeId).collection('timers')
    .where('machine_id', '==', machineId)
    .where('machine_type', '==', machineType)
    .where('status', '==', 'pending')
    .get();

  if (!existingTimersQuery.empty) {
    await replyMessage(replyToken, `ขออภัยค่ะ 🙏\nเครื่อง ${displayName} กำลังใช้งานอยู่ค่ะ`);
    return;
  }

  await db.collection('stores').doc(storeId).collection('timers').add({
    user_id: userId,
    machine_id: machineId,
    machine_type: machineType,
    display_name: displayName,
    duration_minutes: duration,
    end_time: endTime,
    status: 'pending',
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
      throw new Error("Signature validation failed!");
    }
    const events = JSON.parse(body).events;

    for (const event of events) {
      if (event.type === 'message' && event.message.type === 'text') {
        const userId = event.source.userId;
        const userMessage = event.message.text.trim();
        const replyToken = event.replyToken;

        // ... (logic เดิมของคุณ)
      } else {
        if (event.replyToken) {
          await replyMessage(event.replyToken, 'ขออภัยค่ะ บอทเข้าใจเฉพาะข้อความตัวอักษรเท่านั้น');
        }
      }
    }
    return NextResponse.json({ status: "ok" });
  } catch (error: unknown) {
    console.error("Error in webhook handler:", error);
    // กรณี fallback
    let fallbackReplyToken: string | undefined;
    try {
      fallbackReplyToken = (await request.json())?.events?.[0]?.replyToken;
    } catch {}
    if (fallbackReplyToken) {
      await replyMessage(fallbackReplyToken, 'ขออภัยค่ะ เกิดข้อผิดพลาดทางเทคนิค กรุณาลองใหม่อีกครั้ง');
    }
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
