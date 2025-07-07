'use client';

import { useState, useEffect } from 'react';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, updateDoc } from 'firebase/firestore';

// === กำหนดค่า Firebase (ใช้ของโปรเจกต์คุณ) ===
// ตรวจสอบว่าได้ตั้งค่า Environment Variables ใน Vercel แล้ว:
// NEXT_PUBLIC_FIREBASE_API_KEY
// NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
// NEXT_PUBLIC_FIREBASE_PROJECT_ID
// NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
// NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
// NEXT_PUBLIC_FIREBASE_APP_ID
// NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID (ถ้ามี)

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

// Initialize Firebase if not already initialized
let firebaseApp;
if (!getApps().length) {
  firebaseApp = initializeApp(firebaseConfig);
} else {
  firebaseApp = getApp(); // if already initialized, use that one
}

const db = getFirestore(firebaseApp);

// === รหัสผ่านสำหรับเข้าหน้า Admin ===
const ADMIN_PASSWORD = 'admin123'; // <--- คุณสามารถเปลี่ยนรหัสผ่านได้ที่นี่

interface MachineConfig {
  id: string; // Document ID from Firestore
  machine_id: number;
  machine_type: 'washer' | 'dryer';
  duration_minutes: number;
  is_active: boolean;
  display_name: string;
}

export default function AdminPage() {
  const [password, setPassword] = useState('');
  const [loggedIn, setLoggedIn] = useState(false);
  const [error, setError] = useState('');
  const [machines, setMachines] = useState<MachineConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editFormData, setEditFormData] = useState({ duration_minutes: 0, is_active: false });

  const STORE_ID = 'laundry_1'; // <--- กำหนด ID ร้านค้าของคุณที่นี่ (ใช้สำหรับร้านแรก)

  useEffect(() => {
    if (loggedIn) {
      fetchMachineConfigs();
    }
  }, [loggedIn]); // Fetch data when logged in status changes

  const fetchMachineConfigs = async () => {
    setLoading(true);
    try {
      // Path to machine_configs: stores/STORE_ID/machine_configs
      const machineConfigsCol = collection(db, 'stores', STORE_ID, 'machine_configs');
      const machineSnapshot = await getDocs(machineConfigsCol);
      const machineList = machineSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as MachineConfig[];
      // Sort machines for consistent display
      machineList.sort((a, b) => {
          // Sort by type (washer first, then dryer)
          if (a.machine_type === 'washer' && b.machine_type === 'dryer') return -1;
          if (a.machine_type === 'dryer' && b.machine_type === 'washer') return 1;
          // Then sort by machine_id
          return a.machine_id - b.machine_id;
      });
      setMachines(machineList);
    } catch (err) {
      console.error("Error fetching machine configs:", err);
      setError("ไม่สามารถดึงข้อมูลเครื่องได้");
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (password === ADMIN_PASSWORD) {
      setLoggedIn(true);
      setError('');
    } else {
      setError('รหัสผ่านไม่ถูกต้อง');
      setLoggedIn(false);
    }
  };

  const handleEditClick = (machine: MachineConfig) => {
    setEditingId(machine.id);
    setEditFormData({
      duration_minutes: machine.duration_minutes,
      is_active: machine.is_active,
    });
  };

  const handleSaveClick = async (machineId: string) => {
    try {
      const machineRef = doc(db, 'stores', STORE_ID, 'machine_configs', machineId);
      await updateDoc(machineRef, {
        duration_minutes: editFormData.duration_minutes,
        is_active: editFormData.is_active,
      });
      await fetchMachineConfigs(); // Refresh data
      setEditingId(null); // Exit editing mode
    } catch (err) {
      console.error("Error updating machine config:", err);
      setError("ไม่สามารถบันทึกการเปลี่ยนแปลงได้");
    }
  };

  const handleCancelClick = () => {
    setEditingId(null);
  };

  // --- Admin Page Content (after login) ---
  if (loggedIn) {
    return (
      <div className="container" style={{ maxWidth: '800px', padding: '30px', margin: '20px auto' }}>
        <div className="card">
          <h1 style={{ color: 'var(--primary-pink)' }}>
            <span style={{ fontSize: '1.5em', verticalAlign: 'middle', marginRight: '10px' }}>⚙️</span>
            แผงควบคุมผู้ดูแล
          </h1>
          <p style={{ color: 'var(--text-dark)', marginBottom: '20px' }}>จัดการการตั้งค่าเครื่องซักผ้าและอบผ้าของร้าน</p>

          <button 
            className="line-button" 
            style={{ backgroundColor: 'var(--dark-pink)', marginBottom: '30px' }}
            onClick={() => setLoggedIn(false)} // Logout button
          >
            <span style={{ fontSize: '1.2em', verticalAlign: 'middle', marginRight: '5px' }}>🚪</span>
            ออกจากระบบ
          </button>

          {error && <p style={{ color: '#dc3545', marginBottom: '15px', fontWeight: 'bold' }}>{error}</p>}

          {loading ? (
            <p>กำลังโหลดข้อมูลเครื่องจักร...</p>
          ) : (
            <div className="machine-list" style={{ textAlign: 'left' }}>
              {machines.length === 0 ? (
                <p style={{ textAlign: 'center', color: '#777' }}>ไม่พบข้อมูลเครื่องจักร</p>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '20px' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid var(--light-pink)' }}>
                      <th style={{ padding: '10px', textAlign: 'left', color: 'var(--dark-pink)' }}>เครื่อง</th>
                      <th style={{ padding: '10px', textAlign: 'left', color: 'var(--dark-pink)' }}>ประเภท</th>
                      <th style={{ padding: '10px', textAlign: 'left', color: 'var(--dark-pink)' }}>เวลา (นาที)</th>
                      <th style={{ padding: '10px', textAlign: 'left', color: 'var(--dark-pink)' }}>สถานะ</th>
                      <th style={{ padding: '10px', textAlign: 'right', color: 'var(--dark-pink)' }}>จัดการ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {machines.map(machine => (
                      <tr key={machine.id} style={{ borderBottom: '1px dashed #eee' }}>
                        <td style={{ padding: '10px', fontWeight: 'bold' }}>{machine.display_name}</td>
                        <td style={{ padding: '10px' }}>{machine.machine_type === 'washer' ? 'ซักผ้า' : 'อบผ้า'}</td>
                        <td style={{ padding: '10px' }}>
                          {editingId === machine.id ? (
                            <input
                              type="number"
                              value={editFormData.duration_minutes}
                              onChange={(e) => setEditFormData({ ...editFormData, duration_minutes: parseInt(e.target.value) || 0 })}
                              style={{ width: '60px', padding: '5px', borderRadius: '5px', border: '1px solid #ccc' }}
                            />
                          ) : (
                            machine.duration_minutes
                          )}
                        </td>
                        <td style={{ padding: '10px' }}>
                          {editingId === machine.id ? (
                            <input
                              type="checkbox"
                              checked={editFormData.is_active}
                              onChange={(e) => setEditFormData({ ...editFormData, is_active: e.target.checked })}
                            />
                          ) : (
                            machine.is_active ? 
                              <span style={{ color: 'var(--line-green)', fontWeight: 'bold' }}>ใช้งานอยู่</span> : 
                              <span style={{ color: '#dc3545', fontWeight: 'bold' }}>ปิดใช้งาน</span>
                          )}
                        </td>
                        <td style={{ padding: '10px', textAlign: 'right' }}>
                          {editingId === machine.id ? (
                            <>
                              <button 
                                className="line-button" 
                                style={{ backgroundColor: 'var(--line-green)', padding: '8px 12px', fontSize: '0.9em', marginRight: '5px' }}
                                onClick={() => handleSaveClick(machine.id)}
                              >
                                บันทึก
                              </button>
                              <button 
                                className="line-button" 
                                style={{ backgroundColor: '#6c757d', padding: '8px 12px', fontSize: '0.9em' }}
                                onClick={handleCancelClick}
                              >
                                ยกเลิก
                              </button>
                            </>
                          ) : (
                            <button 
                              className="line-button" 
                              style={{ backgroundColor: 'var(--primary-pink)', padding: '8px 12px', fontSize: '0.9em' }}
                              onClick={() => handleEditClick(machine)}
                            >
                              แก้ไข
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  // --- Admin Login Page Content ---
  return (
    <div className="container" style={{ textAlign: 'center', padding: '50px' }}>
      <div className="card">
        <h1>เข้าสู่ระบบผู้ดูแล</h1>
        <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <input
            type="password"
            placeholder="กรุณาใส่รหัสผ่าน"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{
              padding: '12px',
              margin: '15px 0',
              borderRadius: '8px',
              border: '1px solid #ddd',
              width: '80%',
              maxWidth: '300px',
              fontSize: '1em'
            }}
          />
          {error && <p style={{ color: '#dc3545', fontSize: '0.9em', marginBottom: '10px' }}>{error}</p>}
          <button 
            type="submit" 
            className="line-button"
            style={{ backgroundColor: '#007bff' }}
          >
            เข้าสู่ระบบ
          </button>
        </form>
      </div>
    </div>
  );
}