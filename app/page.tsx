import Link from 'next/link'; // Import Link for internal navigation

export default function HomePage() {
  const lineAddFriendUrl = "https://line.me/R/ti/p/@074lywik"; // LINE OA ID ของคุณ

  return (
    <div className="container">
      <div className="card">
        <h1 style={{ color: 'var(--primary-pink)', fontSize: '2em', marginBottom: '10px' }}>
          <span style={{ fontSize: '1.2em', verticalAlign: 'middle', marginRight: '5px' }}>🧺</span>
          Washing & Drying
          <span style={{ fontSize: '1.2em', verticalAlign: 'middle', marginLeft: '5px' }}>🧺</span>
        </h1>
        <p style={{ color: 'var(--text-dark)', fontSize: '1.1em', marginBottom: '20px' }}>
          ร้านซัก-อบ จบครบที่เดียว หน้าโลตัสอินทร์
        </p>

        <h2 style={{ color: 'var(--dark-pink)', fontSize: '1.5em', marginTop: '30px', marginBottom: '15px' }}>
          <span style={{ fontSize: '1.2em', verticalAlign: 'middle', marginRight: '5px' }}>🔔</span>
          แจ้งเตือนเมื่อผ้าซัก-อบเสร็จ!
        </h2>
        <p style={{ fontSize: '1em', color: 'var(--text-dark)', marginBottom: '25px', lineHeight: '1.6' }}>
          ไม่ต้องรอ ไม่ต้องเฝ้า! ระบบจะแจ้งเตือนคุณผ่าน LINE ทันทีที่ผ้าของคุณซักหรืออบเสร็จ
        </p>

        {/* Instruction Steps */}
        <div style={{ textAlign: 'left', padding: '15px', borderRadius: '10px', backgroundColor: 'var(--bg-light)', marginBottom: '30px' }}>
          <h3 style={{ color: 'var(--primary-pink)', fontSize: '1.2em', marginTop: '0', marginBottom: '10px' }}>ขั้นตอนง่ายๆ:</h3>
          <ol style={{ paddingLeft: '20px', margin: '0', fontSize: '0.95em', color: 'var(--text-dark)' }}>
            <li style={{ marginBottom: '8px' }}>
              <span style={{ fontWeight: 'bold' }}>1. สแกน QR Code:</span> สแกน QR Code ที่หน้าเครื่องซัก-อบ
            </li>
            <li style={{ marginBottom: '8px' }}>
              <span style={{ fontWeight: 'bold' }}>2. กดเพิ่มเพื่อนใน LINE:</span> กดปุ่มด้านล่างเพื่อเพิ่มเพื่อน LINE Official Account ของร้านเรา
            </li>
            <li>
              <span style={{ fontWeight: 'bold' }}>3. เลือกเครื่องใน LINE Chat:</span> พิมพ์ "สวัสดี" หรือข้อความใดๆ ใน LINE Chat แล้วทำตามขั้นตอนเพื่อเลือกเครื่องและเริ่มจับเวลา
            </li>
          </ol>
        </div>

        {/* LINE Add Friend Button */}
        <a
          href={lineAddFriendUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="line-button"
          style={{ padding: '12px 25px', fontSize: '1.1em' }} // Adjusted button size for mobile
        >
          <img
            src="https://cdn.icon-icons.com/icons2/2429/PNG/512/line_logo_icon_147253.png"
            alt="LINE icon"
            className="line-icon"
          />
          เพิ่มเพื่อนใน LINE รับการแจ้งเตือน
        </a>

        <p style={{ fontSize: '0.85em', color: '#777', marginTop: '20px' }}>
          (ระบบจะส่งข้อความแจ้งเตือนผ่าน LINE Official Account ของเรา)
        </p>
      </div>
    </div>
  );
}