// File: app/api/create-store.js
/* eslint-disable @typescript-eslint/no-require-imports */

import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, collection, addDoc } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const firebaseApp = !getApps().length
  ? initializeApp(firebaseConfig)
  : getApp();

const db = getFirestore(firebaseApp);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  try {
    const { storeName, location } = req.body;
    if (!storeName || !location) {
      return res.status(400).json({ message: 'กรุณาระบุชื่อร้านและที่ตั้ง' });
    }

    const storesCollectionRef = collection(db, 'stores');
    const docRef = await addDoc(storesCollectionRef, {
      name: storeName,
      location,
      createdAt: new Date(),
    });

    res.status(201).json({ message: 'สร้างร้านค้าสำเร็จ', storeId: docRef.id });
  } catch (error) {
    console.error('Error creating store:', error);
    res.status(500).json({ message: 'เกิดข้อผิดพลาดในการสร้างร้านค้า', error: error.message });
  }
}
