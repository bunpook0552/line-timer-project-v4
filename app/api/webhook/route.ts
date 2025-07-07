import { NextResponse, type NextRequest } from 'next/server';
import admin from 'firebase-admin';
import crypto from 'crypto';

// --- Firebase Admin SDK Initialization ---
// Initialize Firebase Admin SDK only once.
if (!admin.apps.length) {
  try {
    // Ensure the environment variable is correctly parsed.
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT!);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
  } catch (e) {
    console.error("Firebase Admin initialization error:", e);
  }
}
const db = admin.firestore();
const STORE_ID = 'laundry_1'; // Using this constant for the store ID.

// ---- Type Definitions ----

interface QuickReplyItem {
  type: 'action';
  action: {
    type: 'message';
    label: string;
    text: string;
  };
}

interface Message {
  type: 'text';
  text?: string;
  quickReply?: {
    items: QuickReplyItem[];
  };
}

// --- LINE Messaging API Functions ---

/**
 * Sends a reply message to the user via LINE Messaging API.
 * @param replyToken - The token to reply to a specific event.
 * @param text - The text message to send.
 * @param quickReplyItems - Optional array of quick reply buttons.
 */
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
      const errorData = await response.json();
      console.error("Failed to send reply message:", JSON.stringify(errorData));
    }
  } catch (error) {
      console.error("Error sending reply message:", error);
  }
}

/**
 * Starts a timer for a laundry machine and saves it to Firestore.
 * @param userId - The user's LINE ID.
 * @param storeId - The ID of the laundry store.
 * @param machineType - The type of machine ('washer' or 'dryer').
 * @param machineId - The specific ID of the machine.
 * @param duration - The duration of the timer in minutes.
 * @param displayName - The display name of the machine.
 * @param replyToken - The token for replying to the user.
 */
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
  const timersRef = db.collection('stores').doc(storeId).collection('timers');

  // Check if the machine is already in use.
  const existingTimersQuery = await timersRef
    .where('machine_id', '==', machineId)
    .where('machine_type', '==', machineType)
    .where('status', '==', 'pending')
    .get();

  if (!existingTimersQuery.empty) {
    await replyMessage(replyToken, `ขออภัยค่ะ 🙏\nเครื่อง ${displayName} กำลังใช้งานอยู่ค่ะ`);
    return;
  }

  // Add a new timer to the database.
  await timersRef.add({
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

// --- Webhook Handler ---

export async function POST(request: NextRequest) {
  try {
    const body = await request.text();
    const signature = request.headers.get('x-line-signature') || '';
    const channelSecret = process.env.LINE_MESSAGING_CHANNEL_SECRET!;

    if (!channelSecret) {
      console.error("LINE_MESSAGING_CHANNEL_SECRET is not set.");
      throw new Error("LINE_MESSAGING_CHANNEL_SECRET is not set in environment variables.");
    }

    // Validate the signature.
    const hash = crypto.createHmac('sha256', channelSecret).update(body).digest('base64');
    if (hash !== signature) {
      return new NextResponse("Signature validation failed!", { status: 401 });
    }

    const events = JSON.parse(body).events;

    // Process each event.
    for (const event of events) {
      if (event.type === 'message' && event.message.type === 'text' && event.source.userId) {
        const userId = event.source.userId;
        const userMessage = event.message.text.trim().toLowerCase();
        const replyToken = event.replyToken;

        // --- ADDED LOGIC TO USE THE VARIABLES ---
        // Example command: "start washer 1" or "เริ่มเครื่องซักผ้า 1"
        const match = userMessage.match(/(start|เริ่ม)\s+(washer|dryer|เครื่องซักผ้า|เครื่องอบผ้า)\s+(\d+)/);

        if (match) {
            const machineTypeStr = match[2];
            const machineId = parseInt(match[3], 10);
            
            const machineType: 'washer' | 'dryer' = (machineTypeStr === 'washer' || machineTypeStr === 'เครื่องซักผ้า') ? 'washer' : 'dryer';
            const machineName = machineType === 'washer' ? 'เครื่องซักผ้า' : 'เครื่องอบผ้า';
            const displayName = `${machineName} เบอร์ ${machineId}`;
            
            // Call startTimer function, which uses all the necessary variables.
            await startTimer(userId, STORE_ID, machineType, machineId, 30, displayName, replyToken);
        } else {
            // Default reply if the command is not understood.
            await replyMessage(replyToken, `ฉันไม่เข้าใจคำสั่งค่ะ\nลองพิมพ์ "เริ่มเครื่องซักผ้า 1" เพื่อเริ่มจับเวลา`);
        }
      } else if (event.replyToken) {
        // Reply for non-text messages.
        await replyMessage(event.replyToken, 'ขออภัยค่ะ บอทเข้าใจเฉพาะข้อความตัวอักษรเท่านั้น');
      }
    }
    return NextResponse.json({ status: "ok" });
  } catch (error: unknown) {
    console.error("Error in webhook handler:", error);
    // Do not try to reply here as the request body might have been consumed or invalid.
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
