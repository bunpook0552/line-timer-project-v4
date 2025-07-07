 ```typescript
        'use client'; // This directive ensures the component runs on the client-side

        import { useState } from 'react';

        export default function AdminLoginPage() {
          const [password, setPassword] = useState('');
          const [loggedIn, setLoggedIn] = useState(false);
          const [error, setError] = useState('');

          const handleLogin = (e: React.FormEvent) => {
            e.preventDefault();
            // === รหัสผ่านสำหรับเข้าหน้า Admin ===
            // นี่คือรหัสผ่านง่ายๆ สำหรับทดสอบเท่านั้น
            // ในอนาคตควรใช้ระบบ authentication ที่ปลอดภัยกว่านี้
            const ADMIN_PASSWORD = 'admin123'; // <--- คุณสามารถเปลี่ยนรหัสผ่านได้ที่นี่

            if (password === ADMIN_PASSWORD) {
              setLoggedIn(true);
              setError('');
            } else {
              setError('รหัสผ่านไม่ถูกต้อง');
              setLoggedIn(false);
            }
          };

          if (loggedIn) {
            // ส่วนนี้คือเนื้อหาของหน้า Admin หลังจาก Login สำเร็จ
            // ตอนนี้ยังเป็นแค่ข้อความ แต่จะพัฒนาต่อในขั้นตอนถัดไป
            return (
              <div className="container" style={{ textAlign: 'center', padding: '50px' }}>
                <div className="card">
                  <h1>ยินดีต้อนรับผู้ดูแล!</h1>
                  <p>คุณได้เข้าสู่ระบบ Admin แล้ว</p>
                  <p>หน้านี้จะใช้สำหรับจัดการการตั้งค่าเครื่องและข้อความต่างๆ ในอนาคต</p>
                  <button 
                    className="line-button" 
                    style={{ backgroundColor: '#dc3545', marginTop: '20px' }}
                    onClick={() => setLoggedIn(false)} // ปุ่ม Logout
                  >
                    ออกจากระบบ
                  </button>
                </div>
              </div>
            );
          }

          // หน้า Login
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
        ```