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

// --- Global variable to store fetched messages (cached across invocations) ---
const messagesMap = new Map<string, string>();


// ฟังก์ชันสำหรับดึงข้อความจาก Firebase Firestore
async function fetchMessagesFromFirestore(storeId: string): Promise<void> {
    // สำหรับ Serverless Function ใน Vercel, state จะไม่ถูกรีเซ็ตในทุกๆ การเรียกใช้งาน
    // แต่เราจะ clear map ในทุก request เพื่อให้แน่ใจว่าดึงข้อมูลที่อัปเดตล่าสุด
    if (messagesMap.size > 0 && messagesMap.get('store_id_in_cache') === storeId) {
        return; 
    }
    messagesMap.clear(); // Clear map for each request to ensure fresh messages
    messagesMap.set('store_id_in_cache', storeId); // Mark which store's messages are cached

    try {
        const templatesCol = db.collection('stores').doc(storeId).collection('message_templates');
        const snapshot = await templatesCol.get();
        if (snapshot.empty) {
            console.warn("No message templates found in Firestore. Using default fallbacks.");
            // Fallback to basic default messages if nothing found in DB
            messagesMap.set('initial_greeting', 'สวัสดีค่ะ ร้านซัก-อบ ยินดีต้อนรับ 🙏\n\n📢 กรุณาเลือกบริการที่ต้องการด้านล่างนี้ได้เลยค่ะ!');
            messagesMap.set('start_timer_confirmation', 'รับทราบค่ะ! ✅\nเริ่มจับเวลา {duration} นาทีสำหรับ {display_name} แล้วค่ะ');
            messagesMap.set('machine_busy', 'ขออภัยค่ะ 🙏\nเครื่อง {display_name} กำลังใช้งานอยู่ค่ะ');
            messagesMap.set('machine_inactive', 'ขออภัยค่ะ 🙏\nเครื่อง {display_name} กำลังปิดใช้งานอยู่ค่ะ');
            messagesMap.set('machine_not_found', 'ขออภัยค่ะ ไม่พบหมายเลขเครื่องที่คุณระบุ กรุณาพิมพ์เฉพาะตัวเลขของเครื่องที่เปิดใช้งานค่ะ');
            messagesMap.set('non_text_message', 'ขออภัยค่ะ บอทเข้าใจเฉพาะข้อความตัวอักษรเท่านั้น');
            messagesMap.set('contact_message', 'ขออภัยค่ะ บอทสามารถตั้งเวลาได้จากตัวเลขของเครื่องเท่านั้นค่ะ 🙏\n\nหากต้องการติดต่อเจ้าหน้าที่โดยตรง กรุณาติดต่อที่:\nโทร: 08x-xxx-xxxx\nหรือที่หน้าเคาน์เตอร์ได้เลยค่ะ');
            messagesMap.set('generic_error', 'ขออภัยค่ะ เกิดข้อผิดพลาดทางเทคนิค กรุณาลองใหม่อีกครั้ง');
            // Landing page texts as fallbacks
            messagesMap.set('landing_page_title', '🧺 Washing & Drying 🧺');
            messagesMap.set('landing_page_subtitle', 'ร้านซัก-อบ จบครบที่เดียว หน้าโลตัสอินทร์');
            messagesMap.set('landing_page_notification_header', 'แจ้งเตือนเมื่อผ้าซัก-อบเสร็จ!');
            messagesMap.set('landing_page_notification_description', 'ไม่ต้องรอ ไม่ต้องเฝ้า! ระบบจะแจ้งเตือนคุณผ่าน LINE ทันทีที่ผ้าของคุณซักหรืออบเสร็จ');
            messagesMap.set('landing_page_step1_text', 'สแกน QR Code ที่หน้าเครื่องซัก-อบ');
            messagesMap.set('landing_page_step2_text', 'กดปุ่มด้านล่างเพื่อเพิ่มเพื่อน LINE Official Account ของร้านเรา');
            messagesMap.set('landing_page_step3_text', 'พิมพ์ "สวัสดี" หรือข้อความใดๆ ใน LINE Chat แล้วทำตามขั้นตอนเพื่อเลือกเครื่องและเริ่มจับเวลา');
            messagesMap.set('landing_page_button_text', 'เพิ่มเพื่อนใน LINE รับการแจ้งเตือน');
            messagesMap.set('landing_page_footer_note', '(ระบบจะส่งข้อความแจ้งเตือนผ่าน LINE Official Account ของเรา)');
        } else {
            snapshot.forEach(doc => {
                const data = doc.data() as MessageTemplate;
                if (data.id && data.text) {
                    messagesMap.set(data.id, data.text);
                }
            });
            console.log(`Fetched ${messagesMap.size} message templates.`);
        }
    } catch (error) {
        console.error("Error fetching message templates from Firestore:", error);
        // Ensure basic fallbacks are set even if fetch fails
        if (messagesMap.size === 0) { // Set fallbacks only if map is still empty
            messagesMap.set('initial_greeting', 'สวัสดีค่ะ ร้านซัก-อบ ยินดีต้อนรับ 🙏\n\n📢 กรุณาเลือกบริการที่ต้องการด้านล่างนี้ได้เลยค่ะ!');
            messagesMap.set('start_timer_confirmation', 'รับทราบค่ะ! ✅\nเริ่มจับเวลา {duration} นาทีสำหรับ {display_name} แล้วค่ะ');
            messagesMap.set('machine_busy', 'ขออภัยค่ะ 🙏\nเครื่อง {display_name} กำลังใช้งานอยู่ค่ะ');
            messagesMap.set('machine_inactive', 'ขออภัยค่ะ 🙏\nเครื่อง {display_name} กำลังปิดใช้งานอยู่ค่ะ');
            messagesMap.set('machine_not_found', 'ขออภัยค่ะ ไม่พบหมายเลขเครื่องที่คุณระบุ กรุณาพิมพ์เฉพาะตัวเลขของเครื่องที่เปิดใช้งานค่ะ');
            messagesMap.set('non_text_message', 'ขออภัยค่ะ บอทเข้าใจเฉพาะข้อความตัวอักษรเท่านั้น');
            messagesMap.set('contact_message', 'ขออภัยค่ะ บอทสามารถตั้งเวลาได้จากตัวเลขของเครื่องเท่านั้นค่ะ 🙏\n\nหากต้องการติดต่อเจ้าหน้าที่โดยตรง กรุณาติดต่อที่:\nโทร: 08x-xxx-xxxx\nหรือที่หน้าเคาน์เตอร์ได้เลยค่ะ');
            messagesMap.set('generic_error', 'ขออภัยค่ะ เกิดข้อผิดพลาดทางเทคนิค กรุณาลองใหม่อีกครั้ง');
            // Add new landing page texts as fallbacks too
            messagesMap.set('landing_page_title', '🧺 Washing & Drying 🧺');
            messagesMap.set('landing_page_subtitle', 'ร้านซัก-อบ จบครบที่เดียว หน้าโลตัสอินทร์');
            messagesMap.set('landing_page_notification_header', 'แจ้งเตือนเมื่อผ้าซัก-อบเสร็จ!');
            messagesMap.set('landing_page_notification_description', 'ไม่ต้องรอ ไม่ต้องเฝ้า! ระบบจะแจ้งเตือนคุณผ่าน LINE ทันทีที่ผ้าของคุณซักหรืออบเสร็จ');
            messagesMap.set('landing_page_step1_text', 'สแกน QR Code ที่หน้าเครื่องซัก-อบ');
            messagesMap.set('landing_page_step2_text', 'กดปุ่มด้านล่างเพื่อเพิ่มเพื่อน LINE Official Account ของร้านเรา');
            messagesMap.set('landing_page_step3_text', 'พิมพ์ "สวัสดี" หรือข้อความใดๆ ใน LINE Chat แล้วทำตามขั้นตอนเพื่อเลือกเครื่องและเริ่มจับเวลา');
            messagesMap.set('landing_page_button_text', 'เพิ่มเพื่อนใน LINE รับการแจ้งเตือน');
            messagesMap.set('landing_page_footer_note', '(ระบบจะส่งข้อความแจ้งเตือนผ่าน LINE Official Account ของเรา)');
        }
    }


    // ฟังก์ชันสำหรับส่งข้อความตอบกลับพร้อมปุ่ม Quick Reply
    async function replyMessage(replyToken: string, text: string, currentStoreLineToken: string, quickReplyItems?: QuickReplyItem[]) { // Added currentStoreLineToken
      const replyUrl = '[https://api.line.me/v2/bot/message/reply](https://api.line.me/v2/bot/message/reply)';
      const accessToken = currentStoreLineToken; // Use currentStoreLineToken here
      
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
    async function startTimer(userId: string, storeId: string, machineType: 'washer' | 'dryer', machineId: number, duration: number, displayName: string, replyToken: string, currentStoreLineToken: string) { // Added currentStoreLineToken
        const endTime = new Date(Date.now() + duration * 60 * 1000);
        
        // === ตรวจสอบสถานะเครื่องว่าง/ไม่ว่าง ก่อนบันทึก ===
        const existingTimersQuery = await db.collection('stores').doc(storeId).collection('timers')
            .where('machine_id', '==', machineId)
            .where('machine_type', '==', machineType)
            .where('status', '==', 'pending')
            .get(); 

        if (!existingTimersQuery.empty) {
            await replyMessage(replyToken, messagesMap.get('machine_busy')?.replace('{display_name}', displayName) || 'เครื่องกำลังใช้งานอยู่', currentStoreLineToken); // Pass currentStoreLineToken
            return; // ไม่ต้องทำต่อ ถ้าเครื่องไม่ว่าง
        }

        // บันทึกข้อมูลลง Firestore (timers sub-collection ภายใต้ Store ID)
        await db.collection('stores').doc(storeId).collection('timers').add({
            user_id: userId,
            machine_id: machineId,
            machine_type: machineType, 
            display_name: displayName, 
            duration_minutes: duration, 
            end_time: admin.firestore.Timestamp.fromDate(endTime), // ใช้ Timestamp.fromDate
            status: 'pending',
            created_at: admin.firestore.FieldValue.serverTimestamp(), // เพิ่ม created_at
        });

        await replyMessage(replyToken, 
            messagesMap.get('start_timer_confirmation')
            ?.replace('{duration}', String(duration))
            .replace('{display_name}', displayName) || 'รับทราบค่ะ! เริ่มจับเวลาแล้ว', currentStoreLineToken); // Pass currentStoreLineToken
    }

    export async function POST(request: NextRequest) {
      let storeId: string | null = null; // Declare storeId here
      let channelIdFromLine: string | null = null; // Channel ID from LINE event

      try {
        // === ดึงข้อความจาก Firestore ในทุกการเรียกใช้ ===
        // This will be dynamic based on the LINE channel ID
        
        const body = await request.text();
        const signature = request.headers.get('x-line-signature') || '';
        const channelSecretEnv = process.env.LINE_MESSAGING_CHANNEL_SECRET!; // Renamed to avoid conflict

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
                continue; // Skip group/room messages
            }
            if (!event.source || !event.source.userId || !event.destination) { // FIX: Changed event.source.channelId to event.destination
                console.error("Invalid LINE event source or missing user ID/destination channel ID.");
                continue; // Skip events without essential source info
            }

            // === NEW: Identify store based on LINE's Channel ID ===
            channelIdFromLine = event.destination; // FIX: Changed event.source.channelId to event.destination
            const storesQuery = await db.collection('stores')
                .where('line_bot_user_id', '==', channelIdFromLine) // FIX: Changed to line_bot_user_id
                .limit(1)
                .get();

            if (storesQuery.empty) {
                console.error(`Store not found for LINE Channel ID: ${channelIdFromLine}. Please configure this LINE channel in Firebase 'stores' collection.`);
                return new NextResponse("Store not configured for this LINE channel.", { status: 404 });
            }
            const storeData = storesQuery.docs[0].data();
            storeId = storesQuery.docs[0].id; // Get the Firestore Document ID as STORE_ID
            const currentStoreLineToken = storeData.line_access_token; // Get Access Token for this store

            if (!currentStoreLineToken) {
                console.error(`LINE Access Token missing for store: ${storeId}`);
                throw new Error("LINE Access Token is missing for the identified store.");
            }

            // Fetch messages for this specific store (or use fallbacks)
            await fetchMessagesFromFirestore(storeId); // Call fetchMessagesFromFirestore here

            if (event.type === 'message' && event.message.type === 'text') {
                const userId = event.source.userId; 
                const userMessage = event.message.text.trim().toLowerCase();
                const replyToken = event.replyToken; 

                // --- DEBUG LOG START ---
                console.log("--- WEBHOOK DEBUG LOG ---");
                console.log("Received message:", userMessage);
                console.log("Identified STORE_ID:", storeId);
                // --- DEBUG LOG END ---

                // === LOGIC ใหม่: ตรวจสอบข้อความที่เข้ามา ===
                // ขั้นตอนที่ 1: ลูกค้าเลือกประเภท (ซักผ้า/อบผ้า)
                if (userMessage === "ซักผ้า") {
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
                } 
                // ขั้นตอนที่ 2: ลูกค้าเลือกหมายเลขเครื่อง
                else if (userMessage.startsWith("ซักผ้า_เลือก_")) {
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
                    } else {
                        await replyMessage(replyToken, messagesMap.get('machine_not_found') || 'ข้อมูลหมายเลขเครื่องซักผ้าไม่ถูกต้อง', currentStoreLineToken); 
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
                                await startTimer(userId, storeId, 'dryer', machineConfigData.machine_id, machineConfigData.duration_minutes, machineConfigData.display_name, replyToken, currentStoreLineToken);
                            } else {
                                await replyMessage(replyToken, messagesMap.get('machine_inactive')?.replace('{display_name}', machineConfigData.display_name) || 'เครื่องปิดใช้งานอยู่', currentStoreLineToken);
                            }
                        } else {
                            await replyMessage(replyToken, messagesMap.get('machine_not_found') || 'ไม่พบเครื่องอบผ้าที่คุณเลือก', currentStoreLineToken);
                        }
                    } else {
                        await replyMessage(replyToken, messagesMap.get('machine_not_found') || 'ข้อมูลเครื่องอบผ้าไม่ถูกต้อง', currentStoreLineToken);
                    }
                }
                // ขั้นตอนที่ 0: ข้อความทักทายครั้งแรก หรือข้อความที่ไม่รู้จัก
                else {
                    const initialButtons: QuickReplyItem[] = [
                        { type: 'action', action: { type: 'message', label: 'ซักผ้า', text: 'ซักผ้า' } },
                        { type: 'action', action: { type: 'message', label: 'อบผ้า', text: 'อบผ้า' } }
                    ];
                    await replyMessage(replyToken, messagesMap.get('initial_greeting') || 'สวัสดีค่ะ กรุณาเลือกบริการที่ต้องการค่ะ', currentStoreLineToken, initialButtons);
                }
            } else { // Handle non-text messages (e.g., sticker, image)
                if (event.replyToken) {
                    await replyMessage(event.replyToken, messagesMap.get('non_text_message') || 'ขออภัยค่ะ บอทเข้าใจเฉพาะข้อความตัวอักษรเท่านั้น', currentStoreLineToken);
                }
            }
        }
        return NextResponse.json({ status: "ok" });
    } catch (error: unknown) {
        console.error("Error in webhook handler:", error);
        // In case of any unexpected error, try to reply a generic message
        const fallbackReplyToken = (request.body as { events?: { replyToken?: string }[] })?.events?.[0]?.replyToken;
        // Try to get token from a static env var as fallback if store-specific token failed
        const fallbackAccessToken = process.env.LINE_MESSAGING_TOKEN; 

        if (fallbackReplyToken && fallbackAccessToken) {
            await replyMessage(fallbackReplyToken, messagesMap.get('generic_error') || 'ขออภัยค่ะ เกิดข้อผิดพลาดทางเทคนิค กรุณาลองใหม่อีกครั้ง', fallbackAccessToken);
        }
        return new NextResponse("Internal Server Error", { status: 500 });
    }
}