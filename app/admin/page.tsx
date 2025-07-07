'use client';

import { useState, useEffect } from 'react';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, updateDoc, query, where } from 'firebase/firestore';

// === กำหนดค่า Firebase (ใช้ของโปรเจกต์คุณ) ===
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

interface ActiveTimer {
  id: string; // Document ID from Firestore (timers collection)
  user_id: string;
  machine_id: number;
  machine_type: 'washer' | 'dryer';
  display_name: string;
  duration_minutes: number;
  end_time: { seconds: number; nanoseconds: number; }; // Firestore Timestamp
  status: string;
}

interface MessageTemplate {
  docId: string; // Document ID in Firestore
  id: string; // Custom ID from database (e.g., 'initial_greeting')
  text: string;
}

export default function AdminPage() {
  const [password, setPassword] = useState('');
  const [loggedIn, setLoggedIn] = useState(false);
  const [error, setError] = useState('');
  const [machines, setMachines] = useState<MachineConfig[]>([]);
  const [activeTimers, setActiveTimers] = useState<ActiveTimer[]>([]);
  const [messageTemplates, setMessageTemplates] = useState<MessageTemplate[]>([]); // New state for message templates
  const [loadingMachines, setLoadingMachines] = useState(true);
  const [loadingTimers, setLoadingTimers] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(true); // New loading state for messages
  const [editingMachineId, setEditingMachineId] = useState<string | null>(null); // Renamed for clarity
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null); // New editing state for messages
  const [editMachineFormData, setEditMachineFormData] = useState({ duration_minutes: 0, is_active: false }); // Renamed for clarity
  const [editMessageFormData, setEditMessageFormData] = useState(''); // New editing state for messages

  const STORE_ID = 'laundry_1'; // <--- กำหนด ID ร้านค้าของคุณที่นี่ (ใช้สำหรับร้านแรก)

  useEffect(() => {
    if (loggedIn) {
      fetchMachineConfigs();
      fetchActiveTimers();
      fetchMessageTemplates(); // Fetch message templates when logged in
    }
  }, [loggedIn]); 

  // Function to fetch machine configurations
  const fetchMachineConfigs = async () => {
    setLoadingMachines(true);
    try {
      const machineConfigsCol = collection(db, 'stores', STORE_ID, 'machine_configs');
      const machineSnapshot = await getDocs(machineConfigsCol);
      const machineList = machineSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as MachineConfig[];
      machineList.sort((a, b) => {
          if (a.machine_type === b.machine_type) {
              return a.machine_id - b.machine_id;
          }
          return a.machine_type.localeCompare(b.machine_type);
      });
      setMachines(machineList);
    } catch (err) {
      console.error("Error fetching machine configs:", err);
      setError("ไม่สามารถดึงข้อมูลการตั้งค่าเครื่องได้");
    } finally {
      setLoadingMachines(false);
    }
  };

  // Function to fetch active timers
  const fetchActiveTimers = async () => {
    setLoadingTimers(true);
    try {
      const timersCol = collection(db, 'stores', STORE_ID, 'timers');
      
      // *** CORRECTED FIREBASE QUERY SYNTAX ***
      const q = query(timersCol, where('status', '==', 'pending'));
      const activeTimersSnapshot = await getDocs(q);
      
      const timerList = activeTimersSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as ActiveTimer[];

      timerList.sort((a, b) => {
        const dateA = new Date(a.end_time.seconds * 1000 + a.end_time.nanoseconds / 1000000);
        const dateB = new Date(b.end_time.seconds * 1000 + b.end_time.nanoseconds / 1000000);
        return dateA.getTime() - dateB.getTime();
      });
      
      setActiveTimers(timerList);
    } catch (err: unknown) {
      console.error("Error fetching active timers:", err);
      if (typeof err === 'object' && err !== null && 'code' in err && 'details' in err) {
        const firebaseError = err as { code: string, details: string };
        if (firebaseError.code === 'failed-precondition' && firebaseError.details.includes('requires an index')) {
          setError("Firebase Index สำหรับรายการที่กำลังทำงานยังไม่ถูกสร้าง กรุณาสร้างตามคำแนะนำใน Console Log");
        } else {
          setError("ไม่สามารถดึงข้อมูลรายการที่กำลังทำงานได้");
        }
      } else {
        setError("ไม่สามารถดึงข้อมูลรายการที่กำลังทำงานได้");
      }
    } finally {
      setLoadingTimers(false);
    }
  };

  // === NEW: Function to fetch message templates ===
  const fetchMessageTemplates = async () => {
    setLoadingMessages(true);
    try {
      const templatesCol = collection(db, 'stores', STORE_ID, 'message_templates');
      const templateSnapshot = await getDocs(templatesCol);
      const templateList = templateSnapshot.docs.map(doc => ({
        docId: doc.id, // Store Firestore's document ID
        ...doc.data()
      })) as MessageTemplate[];
      // Sort alphabetically by custom 'id' for consistent display
      templateList.sort((a, b) => a.id.localeCompare(b.id));
      setMessageTemplates(templateList);
    } catch (err) {
      console.error("Error fetching message templates:", err);
      setError("ไม่สามารถดึงข้อมูลข้อความแจ้งเตือนได้");
    } finally {
      setLoadingMessages(false);
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

  // Function to handle edit machine config click
  const handleEditMachineClick = (machine: MachineConfig) => {
    setEditingMachineId(machine.id);
    setEditMachineFormData({
      duration_minutes: machine.duration_minutes,
      is_active: machine.is_active,
    });
  };

  // Function to handle saving machine config
  const handleSaveMachineClick = async (machineDocId: string) => {
    try {
      const machineRef = doc(db, 'stores', STORE_ID, 'machine_configs', machineDocId);
      await updateDoc(machineRef, {
        duration_minutes: editMachineFormData.duration_minutes,
        is_active: editMachineFormData.is_active,
      });
      await fetchMachineConfigs(); // Refresh data
      setEditingMachineId(null); // Exit editing mode
    } catch (err) {
      console.error("Error updating machine config:", err);
      setError("ไม่สามารถบันทึกการเปลี่ยนแปลงได้");
    }
  };

  // Function to handle cancelling machine edit
  const handleCancelMachineEdit = () => {
    setEditingMachineId(null);
  };

  // Function to handle cancelling an active timer
  const handleCancelTimer = async (timerId: string, machineDisplayName: string) => {
    if (window.confirm(`คุณแน่ใจหรือไม่ที่จะยกเลิกการจับเวลาของ ${machineDisplayName} (ID: ${timerId})?`)) {
      try {
        const response = await fetch('/api/admin/timers/cancel', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ timerId, storeId: STORE_ID }),
        });

        if (response.ok) {
            alert(`ยกเลิกการจับเวลาของ ${machineDisplayName} เรียบร้อยแล้ว`);
            await fetchActiveTimers(); // Refresh active timers
        } else {
            const errorData = await response.json();
            alert(`ไม่สามารถยกเลิกได้: ${errorData.message || 'เกิดข้อผิดพลาด'}`);
        }
      } catch (err) {
        console.error("Error cancelling timer:", err);
        alert("เกิดข้อผิดพลาดในการยกเลิกการจับเวลา");
      }
    }
  };

  // === NEW: Message Template Management Functions ===
  const handleEditMessageClick = (template: MessageTemplate) => {
    setEditingMessageId(template.docId);
    setEditMessageFormData(template.text);
  };

  const handleSaveMessageClick = async (templateDocId: string) => {
    try {
      const templateRef = doc(db, 'stores', STORE_ID, 'message_templates', templateDocId);
      await updateDoc(templateRef, {
        text: editMessageFormData,
      });
      await fetchMessageTemplates(); // Refresh data
      setEditingMessageId(null); // Exit editing mode
    } catch (err) {
      console.error("Error updating message template:", err);
      setError("ไม่สามารถบันทึกข้อความได้");
    }
  };

  const handleCancelMessageEdit = () => {
    setEditingMessageId(null);
  };

  // --- Admin Page Content (after login) ---
  if (loggedIn) {
    return (
      <div className="container" style={{ maxWidth: '1000px', padding: '30px', margin: '20px auto' }}>
        <div className="card">
          <h1 style={{ color: 'var(--primary-pink)' }}>
            <span style={{ fontSize: '1.5em', verticalAlign: 'middle', marginRight: '10px' }}>⚙️</span>
            แผงควบคุมผู้ดูแล
          </h1>
          <p style={{ color: 'var(--text-dark)', marginBottom: '20px' }}>จัดการการตั้งค่าเครื่องซักผ้า-อบผ้า และข้อความแจ้งเตือนของร้าน</p>

          <button 
            className="line-button" 
            style={{ backgroundColor: 'var(--dark-pink)', marginBottom: '30px' }}
            onClick={() => setLoggedIn(false)} // Logout button
          >
            <span style={{ fontSize: '1.2em', verticalAlign: 'middle', marginRight: '5px' }}>🚪</span>
            ออกจากระบบ
          </button>

          {error && <p style={{ color: '#dc3545', marginBottom: '15px', fontWeight: 'bold' }}>{error}</p>}

          {/* Machine Configurations Section */}
          <h2 style={{ color: 'var(--dark-pink)', marginTop: '40px', marginBottom: '20px' }}>
            <span style={{ fontSize: '1.2em', vertical-align: 'middle', marginRight: '5px' }}>🔧</span>
            การตั้งค่าเครื่องจักร
          </h2>
          {loadingMachines ? (
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
                      <th style={{ padding: '10px', textAlign: 'left', color: 'var(--text-dark)' }}>ใช้งานอยู่</th>
                      <th style={{ padding: '10px', textAlign: 'right', color: 'var(--dark-pink)' }}>จัดการ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {machines.map(machine => (
                      <tr key={machine.id} style={{ borderBottom: '1px dashed #eee' }}>
                        <td style={{ padding: '10px', fontWeight: 'bold' }}>{machine.display_name}</td>
                        <td style={{ padding: '10px' }}>{machine.machine_type === 'washer' ? 'ซักผ้า' : 'อบผ้า'}</td>
                        <td style={{ padding: '10px' }}>
                          {editingMachineId === machine.id ? (
                            <input
                              type="number"
                              value={editMachineFormData.duration_minutes}
                              onChange={(e) => setEditMachineFormData({ ...editMachineFormData, duration_minutes: parseInt(e.target.value) || 0 })}
                              style={{ width: '60px', padding: '5px', borderRadius: '5px', border: '1px solid #ccc' }}
                            />
                          ) : (
                            machine.duration_minutes
                          )}
                        </td>
                        <td style={{ padding: '10px' }}>
                          {editingMachineId === machine.id ? (
                            <input
                              type="checkbox"
                              checked={editMachineFormData.is_active}
                              onChange={(e) => setEditMachineFormData({ ...editMachineFormData, is_active: e.target.checked })}
                            />
                          ) : (
                            machine.is_active ? 
                              <span style={{ color: 'var(--line-green)', fontWeight: 'bold' }}>✅</span> : 
                              <span style={{ color: '#dc3545', fontWeight: 'bold' }}>❌</span>
                          )}
                        </td>
                        <td style={{ padding: '10px', textAlign: 'right' }}>
                          {editingMachineId === machine.id ? (
                            <>
                              <button 
                                className="line-button" 
                                style={{ backgroundColor: 'var(--line-green)', padding: '8px 12px', fontSize: '0.9em', marginRight: '5px' }}
                                onClick={() => handleSaveMachineClick(machine.id)}
                              >
                                บันทึก
                              </button>
                              <button 
                                className="line-button" 
                                style={{ backgroundColor: '#6c757d', padding: '8px 12px', fontSize: '0.9em' }}
                                onClick={handleCancelMachineEdit}
                              >
                                ยกเลิก
                              </button>
                            </>
                          ) : (
                            <button 
                              className="line-button" 
                              style={{ backgroundColor: 'var(--primary-pink)', padding: '8px 12px', fontSize: '0.9em' }}
                              onClick={() => handleEditMachineClick(machine)}
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

          {/* Active Timers Section */}
          <h2 style={{ color: 'var(--dark-pink)', marginTop: '40px', marginBottom: '20px' }}>
            <span style={{ fontSize: '1.2em', vertical-align: 'middle', marginRight: '5px' }}>⏱️</span>
            รายการเครื่องที่กำลังทำงาน
          </h2>
          {loadingTimers ? (
            <p>กำลังโหลดรายการที่กำลังทำงาน...</p>
          ) : (
            <div className="active-timers-list" style={{ textAlign: 'left' }}>
              {activeTimers.length === 0 ? (
                <p style={{ textAlign: 'center', color: '#777' }}>ไม่มีเครื่องใดกำลังทำงานอยู่</p>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '20px' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid var(--light-pink)' }}>
                      <th style={{ padding: '10px', textAlign: 'left', color: 'var(--dark-pink)' }}>เครื่อง</th>
                      <th style={{ padding: '10px', textAlign: 'left', color: 'var(--dark-pink)' }}>เริ่มโดย</th>
                      <th style={{ padding: '10px', textAlign: 'left', color: 'var(--dark-pink)' }}>เสร็จใน</th>
                      <th style={{ padding: '10px', textAlign: 'right', color: 'var(--dark-pink)' }}>จัดการ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeTimers.map(timer => (
                      <tr key={timer.id} style={{ borderBottom: '1px dashed #eee' }}>
                        <td style={{ padding: '10px', fontWeight: 'bold' }}>{timer.display_name} ({timer.duration_minutes} นาที)</td>
                        <td style={{ padding: '10px', fontSize: '0.9em' }}>{timer.user_id.substring(0, 8)}...</td>
                        <td style={{ padding: '10px' }}>{new Date(timer.end_time.seconds * 1000).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}</td>
                        <td style={{ padding: '10px', textAlign: 'right' }}>
                          <button 
                            className="line-button" 
                            style={{ backgroundColor: '#dc3545', padding: '8px 12px', fontSize: '0.9em' }}
                            onClick={() => handleCancelTimer(timer.id, timer.display_name)}
                          >
                            ยกเลิกการจับเวลา
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* Message Templates Section */}
          <h2 style={{ color: 'var(--dark-pink)', marginTop: '40px', marginBottom: '20px' }}>
            <span style={{ fontSize: '1.2em', vertical-align: 'middle', marginRight: '5px' }}>💬</span>
            ข้อความแจ้งเตือนและตอบกลับ
          </h2>
          {loadingMessages ? (
            <p>กำลังโหลดข้อความ...</p>
          ) : (
            <div className="message-templates-list" style={{ textAlign: 'left' }}>
              {messageTemplates.length === 0 ? (
                <p style={{ textAlign: 'center', color: '#777' }}>ไม่พบข้อมูลข้อความ กรุณาเพิ่มใน Firebase Console</p>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '20px' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid var(--light-pink)' }}>
                      <th style={{ padding: '10px', textAlign: 'left', color: 'var(--dark-pink)' }}>ประเภทข้อความ (ID)</th>
                      <th style={{ padding: '10px', textAlign: 'left', color: 'var(--dark-pink)' }}>เนื้อหาข้อความ</th>
                      <th style={{ padding: '10px', textAlign: 'right', color: 'var(--dark-pink)' }}>จัดการ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {messageTemplates.map(template => (
                      <tr key={template.docId} style={{ borderBottom: '1px dashed #eee' }}>
                        <td style={{ padding: '10px', fontWeight: 'bold', fontSize: '0.9em' }}>{template.id}</td>
                        <td style={{ padding: '10px', fontSize: '0.9em' }}>
                          {editingMessageId === template.docId ? (
                            <textarea
                              value={editMessageFormData}
                              onChange={(e) => setEditMessageFormData(e.target.value)}
                              rows={3}
                              style={{ width: '100%', padding: '5px', borderRadius: '5px', border: '1px solid #ccc', resize: 'vertical' }}
                            />
                          ) : (
                            template.text
                          )}
                        </td>
                        <td style={{ padding: '10px', textAlign: 'right' }}>
                          {editingMessageId === template.docId ? (
                            <>
                              <button 
                                className="line-button" 
                                style={{ backgroundColor: 'var(--line-green)', padding: '8px 12px', fontSize: '0.9em', marginRight: '5px' }}
                                onClick={() => handleSaveMessageClick(template.docId)}
                              >
                                บันทึก
                              </button>
                              <button 
                                className="line-button" 
                                style={{ backgroundColor: '#6c757d', padding: '8px 12px', fontSize: '0.9em' }}
                                onClick={handleCancelMessageEdit}
                              >
                                ยกเลิก
                              </button>
                            </>
                          ) : (
                            <button 
                              className="line-button" 
                              style={{ backgroundColor: 'var(--primary-pink)', padding: '8px 12px', fontSize: '0.9em' }}
                              onClick={() => handleEditMessageClick(template)}
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