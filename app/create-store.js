// app/api/create-store.js

import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore, collection, addDoc } from "firebase/firestore";

// กำหนดค่า Firebase Configuration จากตัวแปรสภาพแวดล้อม
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// Initialize หรือดึงแอป Firebase ที่มีอยู่แล้ว
const firebaseApp = !getApps().length
  ? initializeApp(firebaseConfig)
  : getApp();

// เก็บ reference ไปยัง Firestore
const db = getFirestore(firebaseApp);

export default async function handler(req, res) {
  // รับเฉพาะ POST
  if (req.method !== "POST") {
    res.status(405).json({ message: "Method Not Allowed" });
    return;
  }

  try {
    const data = req.body;
    // เพิ่มเอกสารใหม่ในคอลเล็กชันชื่อ "your-collection-name"
    const docRef = await addDoc(collection(db, "your-collection-name"), data);
    res.status(201).json({ id: docRef.id });
  } catch (error) {
    console.error("Error adding document:", error);
    res.status(500).json({ error: error.message });
  }
}
