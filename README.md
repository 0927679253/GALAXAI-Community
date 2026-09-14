# GALAXAI Community — production-ready starter

เว็บชุมชน Minecraft Bedrock พร้อม backend จริง: Node.js + Express + SQLite, bcrypt password hashing, JWT sessions, admin news/order management, live server status proxy และ endpoint สำหรับปลั๊กอิน Minecraft ส่งสถิติผู้เล่น

## 1) รันบนเครื่อง

ต้องใช้ Node.js 20+

```bash
npm install
cp .env.example .env
# แก้ .env ให้เป็นคีย์สุ่มของคุณ
npm start
```

เปิด `http://localhost:3000`

## 2) รันด้วย Docker

```bash
cp .env.example .env
# แก้ .env
sudo docker compose up -d --build
```

ฐานข้อมูลถูกเก็บใน volume `galaxai_data` จึงไม่หายเมื่อ recreate container

## 3) ตั้งค่าเซิร์ฟเวอร์เกม

แก้ `config.js`:

- `serverAddress`
- `serverPort`
- รายการร้านค้า / กิจกรรม / ทีมงาน / กฎ / FAQ

หน้าเว็บจะเรียก `/api/server/status` จาก backend ซึ่งไปตรวจ Bedrock status ให้ ไม่ต้องให้ browser เรียก provider โดยตรง

## 4) แอดมิน

ใส่ `ADMIN_KEY` ใน `.env` แล้วใช้ช่อง “สำหรับแอดมิน” ในหน้าเว็บเพื่อ:

- เพิ่ม/ประกาศข่าว
- ดูคำสั่งซื้อ
- เปลี่ยนสถานะคำสั่งซื้อเป็น รอดำเนินการ / กำลังดำเนินการ / ส่งแล้ว / ยกเลิก

อย่าใส่ `ADMIN_KEY` ลงใน `config.js` หรือ source code ที่แจกสาธารณะ

## 5) สถิติผู้เล่นจริงจาก Minecraft

ให้ปลั๊กอินของเซิร์ฟเวอร์ส่งข้อมูลไป `/api/plugin/player` หรือ `/api/plugin/players` พร้อม `x-plugin-key` ตาม `plugin-integration.md` แล้วหน้า Player Lookup และ Leaderboard จะอ่านจากฐานข้อมูลจริง

## 6) สิ่งที่ยังต้องผูกกับบริการของเจ้าของเซิร์ฟเวอร์

- โดเมนจริง + HTTPS (แนะนำ reverse proxy เช่น Caddy/Nginx)
- Minecraft server จริงใน `config.js`
- ปลั๊กอิน/ระบบเศรษฐกิจจริงเพื่อส่ง level, playtime, balance
- ระบบชำระเงินจริง หากต้องการขายของด้วยเงินจริง (โปรเจกต์นี้ยังเป็นระบบรับคำสั่งซื้อ ไม่ได้หลอกว่าชำระเงินสำเร็จ)
- Microsoft/Xbox OAuth หากต้องการยืนยันตัวตน Xbox แบบทางการ

## 7) Backup

สำรองไฟล์ `data/galaxai.sqlite` หรือ volume `galaxai_data` เป็นประจำ

## 8) HTTPS

ใช้ Caddy/Nginx เป็น reverse proxy หน้า Node.js และเปิด HTTPS ก่อนใช้งานจริง ตัวอย่าง Caddy อยู่ใน `Caddyfile` (เปลี่ยน `example.com` เป็นโดเมนของคุณ)
