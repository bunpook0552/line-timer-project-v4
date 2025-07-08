import { NextResponse, type NextRequest } from 'next/server';
import admin from 'firebase-admin';
import crypto from 'crypto';

// --- ส่วนเริ่มต้นการเชื่อมต่อ Firebase Admin SDK (สำหรับหลังบ้าน) ---
// Initialize Firebase Admin SDK if it hasn't been initialized yet.
// This ensures that the app can communicate with Firestore.
if (!admin.apps.length) {
  try {
    // Parse the service account key from environment variables.
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

// --- Type Definitions for TypeScript ---

// Defines the structure for a LINE Quick Reply action.
interface QuickReplyAction {
  type: 'message';
  label: string;
  text: string;
}

// Defines the structure for a LINE Quick Reply item.
interface QuickReplyItem {
  type: 'action';
  action: QuickReplyAction;
}

// Defines the structure for message templates fetched from Firestore.
interface MessageTemplate {
  id: string; // A custom identifier like 'initial_greeting'
  text: string;
}

// --- Global variable to cache fetched messages ---
// Using a Map to store messages improves performance by avoiding repeated Firestore queries.
const messagesMap = new Map<string, string>();


// --- Helper Functions ---

/**
 * Fetches message templates from a specific store's collection in Firestore.
 * If templates are not found, it populates the cache with default fallback messages.
 * @param {string} storeId - The Firestore document ID of the store.
 */
async function fetchMessagesFromFirestore(storeId: string): Promise<void> {
    // To ensure freshness, clear the map for each request.
    // This prevents serving stale data from a previous invocation.
    messagesMap.clear();
    messagesMap.set('store_id_in_cache', storeId);

    try {
        const templatesCol = db.collection('stores').doc(storeId).collection('message_templates');
        const snapshot = await templatesCol.get();
        if (snapshot.empty) {
            console.warn(`No message templates found for store ${storeId}. Using default fallbacks.`);
            // Populate with default messages if none are found in the database.
            messagesMap.set('initial_greeting', 'สวัสดีค่ะ ร้านซัก-อบ ยินดีต้อนรับ 🙏\n\n📢 กรุณาเลือกบริการที่ต้องการด้านล่างนี้ได้เลยค่ะ!');
            messagesMap.set('start_timer_confirmation', 'รับทราบค่ะ! ✅\nเริ่มจับเวลา {duration} นาทีสำหรับ {display_name} แล้วค่ะ');
            messagesMap.set('machine_busy', 'ขออภัยค่ะ 🙏\nเครื่อง {display_name} กำลังใช้งานอยู่ค่ะ');
            messagesMap.set('machine_inactive', 'ขออภัยค่ะ 🙏\nเครื่อง {display_name} กำลังปิดใช้งานอยู่ค่ะ');
            messagesMap.set('machine_not_found', 'ขออภัยค่ะ ไม่พบหมายเลขเครื่องที่คุณระบุ กรุณาพิมพ์เฉพาะตัวเลขของเครื่องที่เปิดใช้งานค่ะ');
            messagesMap.set('non_text_message', 'ขออภัยค่ะ บอทเข้าใจเฉพาะข้อความตัวอักษรเท่านั้น');
            messagesMap.set('select_washer_message', 'กรุณาเลือกหมายเลขเครื่องซักผ้าค่ะ');
            messagesMap.set('no_washer_available_message', 'ขออภัยค่ะ ขณะนี้ไม่มีเครื่องซักผ้าว่าง');
            messagesMap.set('select_dryer_message', 'กรุณาเลือกเวลาสำหรับเครื่องอบผ้าค่ะ');
            messagesMap.set('no_dryer_available_message', 'ขออภัยค่ะ ขณะนี้ไม่มีเครื่องอบผ้าว่าง');
            messagesMap.set('generic_error', 'ขออภัยค่ะ เกิดข้อผิดพลาดทางเทคนิค กรุณาลองใหม่อีกครั้ง');
        } else {
            snapshot.forEach(doc => {
                const data = doc.data() as MessageTemplate;
                // Ensure the document has the required fields before adding to the map.
                if (data.id && data.text) {
                    messagesMap.set(data.id, data.text);
                }
            });
            console.log(`Fetched ${messagesMap.size} message templates for store ${storeId}.`);
        }
    } catch (error) {
        console.error("Error fetching message templates from Firestore:", error);
        // Ensure basic fallbacks are set even if the fetch operation fails.
        if (messagesMap.size === 1) { // Only store_id_in_cache is present
            messagesMap.set('initial_greeting', 'สวัสดีค่ะ ร้านซัก-อบ ยินดีต้อนรับ 🙏\n\n📢 กรุณาเลือกบริการที่ต้องการด้านล่างนี้ได้เลยค่ะ!');
            messagesMap.set('generic_error', 'ขออภัยค่ะ เกิดข้อผิดพลาดทางเทคนิค กรุณาลองใหม่อีกครั้ง');
        }
    }
}

/**
 * Sends a reply message to the user via the LINE Messaging API.
 * @param {string} replyToken - The token for replying to a specific event.
 * @param {string} text - The message text to send.
 * @param {string} currentStoreLineToken - The LINE Access Token for the specific store.
 * @param {QuickReplyItem[]} [quickReplyItems] - Optional array of quick reply buttons.
 */
async function replyMessage(replyToken: string, text: string, currentStoreLineToken: string, quickReplyItems?: QuickReplyItem[]) {
  const replyUrl = 'https://api.line.me/v2/bot/message/reply';
  const accessToken = currentStoreLineToken;

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
      console.error("Failed to send reply message:", await response.json());
    }
  } catch (error) {
    console.error("Error sending LINE reply:", error);
  }
}

/**
 * Starts a timer for a machine, checking if it's already in use.
 * @param {string} userId - The LINE user ID.
 * @param {string} storeId - The Firestore document ID of the store.
 * @param {'washer' | 'dryer'} machineType - The type of machine.
 * @param {number} machineId - The ID of the machine.
 * @param {number} duration - The duration of the timer in minutes.
 * @param {string} displayName - The display name of the machine.
 * @param {string} replyToken - The LINE reply token.
 * @param {string} currentStoreLineToken - The LINE Access Token for the store.
 */
async function startTimer(userId: string, storeId: string, machineType: 'washer' | 'dryer', machineId: number, duration: number, displayName:string, replyToken: string, currentStoreLineToken: string) {
    const endTime = new Date(Date.now() + duration * 60 * 1000);

    // Check if the machine is already running a timer.
    const existingTimersQuery = await db.collection('stores').doc(storeId).collection('timers')
        .where('machine_id', '==', machineId)
        .where('machine_type', '==', machineType)
        .where('status', '==', 'pending')
        .get();

    if (!existingTimersQuery.empty) {
        // If the machine is busy, notify the user and stop.
        await replyMessage(replyToken, messagesMap.get('machine_busy')?.replace('{display_name}', displayName) || 'เครื่องกำลังใช้งานอยู่', currentStoreLineToken);
        return;
    }

    // If the machine is available, add a new timer document to Firestore.
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

    // Confirm to the user that the timer has started.
    await replyMessage(replyToken,
        messagesMap.get('start_timer_confirmation')
        ?.replace('{duration}', String(duration))
        .replace('{display_name}', displayName) || 'รับทราบค่ะ! เริ่มจับเวลาแล้ว', currentStoreLineToken);
}


// --- Main Webhook Handler (Exported) ---

/**
 * Handles incoming webhook POST requests from the LINE Messaging API.
 * @param {NextRequest} request - The incoming request object.
 * @returns {NextResponse} A response object.
 */
export async function POST(request: NextRequest) {
  let storeId: string | null = null;
  let currentStoreLineToken: string | null = null;

  try {
    const body = await request.text();
    const signature = request.headers.get('x-line-signature') || '';
    const channelSecretEnv = process.env.LINE_MESSAGING_CHANNEL_SECRET!;

    if (!channelSecretEnv) {
      console.error("LINE_MESSAGING_CHANNEL_SECRET is not set.");
      throw new Error("LINE_MESSAGING_CHANNEL_SECRET is not set in environment variables.");
    }

    // Validate the LINE signature to ensure the request is authentic.
    const hash = crypto.createHmac('sha256', channelSecretEnv).update(body).digest('base64');
    if (hash !== signature) {
      return new NextResponse("Signature validation failed!", { status: 401 });
    }

    const events = JSON.parse(body).events;

    // Process each event in the webhook payload.
    for (const event of events) {
        if (event.source && (event.source.type === 'group' || event.source.type === 'room')) {
            console.warn("Bot does not support group/room chats. Skipping event.");
            continue;
        }
        if (!event.source || !event.source.userId || !event.destination) {
            console.error("Invalid LINE event: missing userId or destination channel ID.");
            continue;
        }

        // Identify the store by matching the LINE Bot's User ID (destination) with a store in Firestore.
        const channelIdFromLine = event.destination;
        const storesQuery = await db.collection('stores')
            .where('line_bot_user_id', '==', channelIdFromLine)
            .limit(1)
            .get();

        if (storesQuery.empty) {
            console.error(`Store not found for LINE Channel ID: ${channelIdFromLine}.`);
            return new NextResponse("Store not configured for this LINE channel.", { status: 404 });
        }

        const storeData = storesQuery.docs[0].data();
        storeId = storesQuery.docs[0].id;
        currentStoreLineToken = storeData.line_access_token;

        if (!currentStoreLineToken) {
            console.error(`LINE Access Token missing for store: ${storeId}`);
            return new NextResponse("Internal Server Error: Bot configuration is incomplete.", { status: 500 });
        }

        // Fetch the latest message templates for the identified store.
        await fetchMessagesFromFirestore(storeId);

        if (event.type === 'message' && event.message.type === 'text') {
            const userId = event.source.userId;
            const userMessage = event.message.text.trim().toLowerCase();
            const replyToken = event.replyToken;

            // --- Main Logic for Handling User Messages ---

            if (userMessage === "ซักผ้า") {
                // User wants to use a washing machine.
                const machineConfigsCol = db.collection('stores').doc(storeId).collection('machine_configs');
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
                    await replyMessage(replyToken, messagesMap.get('select_washer_message') || 'กรุณาเลือกหมายเลขเครื่องซักผ้าค่ะ', currentStoreLineToken, washerButtons);
                } else {
                    await replyMessage(replyToken, messagesMap.get('no_washer_available_message') || 'ขออภัยค่ะ ขณะนี้ไม่มีเครื่องซักผ้าว่าง', currentStoreLineToken);
                }

            } else if (userMessage === "อบผ้า") {
                // User wants to use a dryer.
                const machineConfigsCol = db.collection('stores').doc(storeId).collection('machine_configs');
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
                    await replyMessage(replyToken, messagesMap.get('select_dryer_message') || 'กรุณาเลือกเวลาสำหรับเครื่องอบผ้าค่ะ', currentStoreLineToken, dryerButtons);
                } else {
                    await replyMessage(replyToken, messagesMap.get('no_dryer_available_message') || 'ขออภัยค่ะ ขณะนี้ไม่มีเครื่องอบผ้าว่าง', currentStoreLineToken);
                }

            } else if (userMessage.startsWith("ซักผ้า_เลือก_")) {
                // User has selected a specific washing machine.
                const requestedMachineId = parseInt(userMessage.replace('ซักผ้า_เลือก_', ''), 10);
                if (!isNaN(requestedMachineId)) {
                    const machineConfigsCol = db.collection('stores').doc(storeId).collection('machine_configs');
                    const q = machineConfigsCol.where('machine_id', '==', requestedMachineId).where('machine_type', '==', 'washer').limit(1);
                    const machineSnapshot = await q.get();

                    if (!machineSnapshot.empty) {
                        const machineConfigData = machineSnapshot.docs[0].data();
                        if (machineConfigData.is_active) {
                            await startTimer(userId, storeId, 'washer', machineConfigData.machine_id, machineConfigData.duration_minutes, machineConfigData.display_name, replyToken, currentStoreLineToken);
                        } else {
                            await replyMessage(replyToken, messagesMap.get('machine_inactive')?.replace('{display_name}', machineConfigData.display_name) || 'เครื่องปิดใช้งานอยู่', currentStoreLineToken);
                        }
                    } else {
                        await replyMessage(replyToken, messagesMap.get('machine_not_found') || 'ไม่พบหมายเลขเครื่องซักผ้าที่คุณเลือก', currentStoreLineToken);
                    }
                }

            } else if (userMessage.startsWith("อบผ้า_เลือก_")) {
                // User has selected a specific dryer.
                const requestedMachineId = parseInt(userMessage.replace('อบผ้า_เลือก_', ''), 10);
                if (!isNaN(requestedMachineId)) {
                    const machineConfigsCol = db.collection('stores').doc(storeId).collection('machine_configs');
                    const q = machineConfigsCol.where('machine_id', '==', requestedMachineId).where('machine_type', '==', 'dryer').limit(1);
                    const machineSnapshot = await q.get();

                    if (!machineSnapshot.empty) {
                        const machineConfigData = machineSnapshot.docs[0].data();
                        if (machineConfigData.is_active) {
                            await startTimer(userId, storeId, 'dryer', machineConfigData.machine_id, machineConfigData.duration_minutes, machineConfigData.display_name, replyToken, currentStoreLineToken);
                        } else {
                            await replyMessage(replyToken, messagesMap.get('machine_inactive')?.replace('{display_name}', machineConfigData.display_name) || 'เครื่องปิดใช้งานอยู่', currentStoreLineToken);
                        }
                    } else {
                        await replyMessage(replyToken, messagesMap.get('machine_not_found') || 'ไม่พบเครื่องอบผ้าที่คุณเลือก', currentStoreLineToken);
                    }
                }
            } else {
                // Handle initial greeting or unrecognized messages.
                const initialButtons: QuickReplyItem[] = [
                    { type: 'action', action: { type: 'message', label: 'ซักผ้า', text: 'ซักผ้า' } },
                    { type: 'action', action: { type: 'message', label: 'อบผ้า', text: 'อบผ้า' } }
                ];
                await replyMessage(replyToken, messagesMap.get('initial_greeting') || 'สวัสดีค่ะ กรุณาเลือกบริการที่ต้องการค่ะ', currentStoreLineToken, initialButtons);
            }
        } else if (event.replyToken) {
            // Handle non-text messages (e.g., sticker, image).
            await replyMessage(event.replyToken, messagesMap.get('non_text_message') || 'ขออภัยค่ะ บอทเข้าใจเฉพาะข้อความตัวอักษรเท่านั้น', currentStoreLineToken);
        }
    }
    return NextResponse.json({ status: "ok" });
  } catch (error: unknown) {
    console.error("Critical error in webhook handler:", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
