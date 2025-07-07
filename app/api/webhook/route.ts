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

const STORE_ID = 'laundry_1';
// ————————————————————————————————————————————————————————
// Type definitions
interface QuickReplyItem {
  type: string;
  action: {
    type: string;
    label: string;
    text: string;
  };
}

interface LineWebhookBody {
  events?: Array<{
    type: string;
    replyToken?: string;
    message?: { type: string; text: string };
    source?: { userId?: string };
  }>;
}

async function replyMessage(replyToken: string, text: string, quickReplyItems?: QuickReplyItem[]) {
  const replyUrl = 'https://api.line.me/v2/bot/message/reply';
  const accessToken = process.env.LINE_MESSAGING_TOKEN!;

  const messagePayload = {
    replyToken,
    messages: [{ type: 'text', text }],
  };

  if (quickReplyItems && quickReplyItems.length > 0) {
    messagePayload.messages[0].quickReply = { items: quickReplyItems };
  }

  await fetch(replyUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(messagePayload),
  });
}

// ...

export async function POST(request: NextRequest) {
  let bodyText = '';
  try {
    bodyText = await request.text();
    const signature = request.headers.get('x-line-signature') || '';
    const channelSecret = process.env.LINE_MESSAGING_CHANNEL_SECRET!;

    if (!channelSecret) {
      throw new Error("LINE_MESSAGING_CHANNEL_SECRET is not set in environment variables.");
    }

    const hash = crypto.createHmac('sha256', channelSecret).update(bodyText).digest('base64');
    if (hash !== signature) {
      throw new Error("Signature validation failed!");
    }

    const parsed = JSON.parse(bodyText) as LineWebhookBody;
    const events = parsed.events || [];

    for (const event of events) {
      if (event.type === 'message' && event.message?.type === 'text') {
        const userId = event.source?.userId;
        const userMessage = event.message.text.trim();
        const replyToken = event.replyToken;

        // --- DEBUG LOG START ---
        console.log("--- WEBHOOK DEBUG LOG ---");
        console.log("Received message:", userMessage);
        console.log("Using STORE_ID:", STORE_ID);
        // --- DEBUG LOG END ---

        // Your existing event handling logic...

      } else {
        if (event.replyToken) {
          await replyMessage(event.replyToken, 'ขออภัยค่ะ บอทเข้าใจเฉพาะข้อความตัวอักษรเท่านั้น');
        }
      }
    }

    return NextResponse.json({ status: "ok" });
  } catch (error) {
    console.error("Error in webhook handler:", error);
    // Try to parse whatever body we did receive
    const parsed = (() => {
      try { return JSON.parse(bodyText) as LineWebhookBody; }
      catch { return {} as LineWebhookBody; }
    })();
    const fallbackReplyToken = parsed.events?.[0]?.replyToken;
    if (fallbackReplyToken) {
      await replyMessage(fallbackReplyToken, 'ขออภัยค่ะ เกิดข้อผิดพลาดทางเทคนิค กรุณาลองใหม่อีกครั้ง');
    }
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
