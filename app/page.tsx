export default function HomePage() {
  const lineAddFriendUrl = "https://line.me/R/ti/p/@074lywik"; // LINE OA ID ของคุณ

  return (
    <div className="container" style={{ maxWidth: '100%', padding: '10px', margin: '10px auto' }}>
      <div className="card">
        <h1 style={{ color: 'var(--primary-pink)', fontSize: '1.8em', marginBottom: '10px' }}>
          <span style={{ fontSize: '1.5em', verticalAlign: 'middle', marginRight: '10px' }}>🧺</span>
          Washing & Drying
          <span style={{ fontSize: '1.5em', verticalAlign: 'middle', marginLeft: '5px' }}>🧺</span>
        </h1>
        <p style={{ color: 'var(--text-dark)', fontSize: '1.0em', marginBottom: '15px' }}>
          ร้านซัก-อบ จบครบที่เดียว หน้าโลตัสอินทร์
        </p>

        <h2 style={{ color: 'var(--dark-pink)', fontSize: '1.4em', marginTop: '20px', marginBottom: '10px' }}>
          <span style={{ fontSize: '1.2em', verticalAlign: 'middle', marginRight: '5px' }}>🔔</span>
          แจ้งเตือนเมื่อผ้าซัก-อบเสร็จ!
        </h2>
        <p style={{ fontSize: '0.9em', color: 'var(--text-dark)', marginBottom: '20px', lineHeight: '1.5' }}>
          ไม่ต้องรอ ไม่ต้องเฝ้า! ระบบจะแจ้งเตือนคุณผ่าน LINE ทันทีที่ผ้าของคุณซักหรืออบเสร็จ
        </p>

        {/* Instruction Steps */}
        <div style={{ textAlign: 'left', padding: '10px', borderRadius: '8px', backgroundColor: 'var(--bg-light)', marginBottom: '20px' }}>
          <h3 style={{ color: 'var(--primary-pink)', fontSize: '1.1em', marginTop: '0', marginBottom: '8px' }}>ขั้นตอนง่ายๆ:</h3>
          <ol style={{ paddingLeft: '20px', margin: '0', fontSize: '0.85em', color: 'var(--text-dark)' }}>
            <li style={{ marginBottom: '6px' }}>
              <span style={{ fontWeight: 'bold' }}>1. สแกน QR Code:</span> สแกน QR Code ที่หน้าเครื่องซัก-อบ
            </li>
            <li style={{ marginBottom: '6px' }}>
              <span style={{ fontWeight: 'bold' }}>2. กดเพิ่มเพื่อนใน LINE:</span> กดปุ่มด้านล่างเพื่อเพิ่มเพื่อน LINE Official Account ของร้านเรา
            </li>
            <li>
              <span style={{ fontWeight: 'bold' }}>3. เลือกเครื่องใน LINE Chat:</span> พิมพ์ &quot;สวัสดี&quot; หรือข้อความใดๆ ใน LINE Chat แล้วทำตามขั้นตอนเพื่อเลือกเครื่องและเริ่มจับเวลา
            </li>
          </ol>
        </div>

        {/* LINE Add Friend Button */}
        <a
          href={lineAddFriendUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="line-button"
          style={{ padding: '10px 20px', fontSize: '1em' }}
        >
          <img
            src="https://cdn.icon-icons.com/icons2/2429/PNG/512/line_logo_icon_147253.png"
            alt="LINE icon"
            className="line-icon"
          />
          เพิ่มเพื่อนใน LINE รับการแจ้งเตือน
        </a>

        <p style={{ fontSize: '0.8em', color: '#777', marginTop: '15px' }}>
          (ระบบจะส่งข้อความแจ้งเตือนผ่าน LINE Official Account ของเรา)
        </p>
      </div>
    </div>
  );
}
