// app/api/create-store.js

// นำเข้าโมดูลที่จำเป็นจาก Firebase SDK
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, collection, addDoc } from 'firebase/firestore';

// === กำหนดค่า Firebase ของโปรเจกต์คุณ ===
// ค่าเหล่านี้ควรจะถูกดึงมาจาก Environment Variables เพื่อความปลอดภัย
// ตัวอย่าง: process.env.NEXT_PUBLIC_FIREBASE_API_KEY
const firebaseConfig = {
  apiKey: "AIzaSyB1Jt5-ax9HtMfD27mVwOTdWtPZfUfPkUY",
  authDomain: "my-laundry-notifierjpt.firebaseapp.com",
  projectId: "my-laundry-notifierjpt",
  storageBucket: "my-laundry-notifierjpt.firebasestorage.app",
  messagingSenderId: "74772118603",
  appId: "1:74772118603:web:bb514dfda76b25b857e1ce",
  measurementId: "G-ST57NPW8Z9",
};

// ตรวจสอบและเริ่มต้น Firebase App ถ้ายังไม่ได้เริ่มต้น
// เพื่อป้องกันการเริ่มต้นซ้ำเมื่อมีการเรียกใช้ API หลายครั้ง
let firebaseApp;
if (!getApps().length) {
  firebaseApp = initializeApp(firebaseConfig);
} else {
  firebaseApp = getApp(); // ถ้าเริ่มต้นแล้ว ให้ใช้ instance ที่มีอยู่
}

// รับ instance ของ Firestore Database
const db = getFirestore(firebaseApp);

// === ฟังก์ชันหลักสำหรับ API Route ===
// ฟังก์ชันนี้จะถูกเรียกเมื่อมี request เข้ามาที่ /api/create-store
export default async function handler(req, res) {
  // ตรวจสอบว่าเป็น HTTP POST request เท่านั้น
  if (req.method === 'POST') {
    try {
      // ดึงข้อมูลจาก body ของ request
      // ตัวอย่าง: { storeName: "ร้านซักผ้าของฉัน", location: "กรุงเทพฯ" }
      const { storeName, location } = req.body;

      // ตรวจสอบว่ามีข้อมูลที่จำเป็นครบถ้วนหรือไม่
      if (!storeName || !location) {
        return res.status(400).json({ message: 'กรุณาระบุชื่อร้านและที่ตั้ง' });
      }

      // กำหนด collection ที่จะเพิ่มข้อมูลร้านค้า
      // ตัวอย่าง: 'stores'
      const storesCollectionRef = collection(db, 'stores');

      // เพิ่มเอกสารใหม่ลงใน collection 'stores'
      const docRef = await addDoc(storesCollectionRef, {
        name: storeName,
        location: location,
        createdAt: new Date(), // เพิ่ม timestamp สำหรับเวลาที่สร้าง
        // คุณสามารถเพิ่ม field อื่นๆ ได้ตามต้องการ
      });

      // ส่ง response กลับไปว่าสร้างร้านค้าสำเร็จ พร้อม ID ของเอกสารที่สร้าง
      res.status(201).json({ message: 'สร้างร้านค้าสำเร็จ', storeId: docRef.id });

    } catch (error) {
      // จัดการข้อผิดพลาดที่อาจเกิดขึ้นระหว่างการทำงาน
      console.error('Error creating store:', error);
      res.status(500).json({ message: 'เกิดข้อผิดพลาดในการสร้างร้านค้า', error: error.message });
    }
  } else {
    // ถ้าไม่ใช่ POST request ให้ส่งสถานะ 405 Method Not Allowed
    res.setHeader('Allow', ['POST']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}
