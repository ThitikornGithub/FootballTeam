# Football Match Maker

Mobile-first web app สำหรับจัดตารางฟุตบอลแบบ round robin บน 1 สนาม หมุนเวียนผู้รักษาประตู บันทึกสกอร์ ตารางคะแนน และวางแผนบนกระดาน tactic

- Production: <https://thitikorngithub.github.io/FootballTeam/>
- Repository: <https://github.com/ThitikornGithub/FootballTeam>
- เอกสาร architecture, persistence, security model, audit findings และแนวทางส่งต่องาน: [PROJECT_HANDOFF.md](./PROJECT_HANDOFF.md)

## Run locally

ต้องใช้ Node.js 22.13 ขึ้นไป

```bash
npm install
npm run dev
```

เปิด `http://localhost:3000`

## Check before release

```bash
npx jiti scripts/verify-engine.ts
npm run lint
./node_modules/.bin/tsc --noEmit
GITHUB_PAGES=true \
NEXT_PUBLIC_BASE_PATH=/FootballTeam \
NEXT_PUBLIC_SITE_URL=https://thitikorngithub.github.io \
npm run build
```

## Main features

- สร้างตารางพบกันหมดด้วย circle-method แล้ววนรอบใหม่จนเต็มเวลาที่เลือก
- เลือกเวลาเริ่ม/จบ ระยะเวลาแข่ง เวลาพัก และกำหนดคู่แรกหรือคู่ถัดไป
- จัดการทีม ผู้เล่น ลำดับ และสถานะขาดวันนี้
- สุ่ม GK แยกทีม พร้อมรอบใหม่และการข้ามคิว
- บันทึกสกอร์ สรุปตารางคะแนน และเพิ่มเกมเมื่อเล่นต่อเกินเวลา
- แก้สกอร์ ยกเลิกผล เริ่ม/จบแมตช์ และดูคิว GK
- วางแผนบนกระดาน tactic และบันทึกโน้ต
- แชร์รูปตารางคะแนนผ่าน Web Share API ดาวน์โหลด PNG หรือคัดลอกข้อความ
- หน้ารวมเกมทั้งหมด พร้อมเปิดและลบเกม
- เก็บ state ของเกมใน Neon Postgres ผ่าน Neon Data API; LocalStorage เป็นเพียง backup

แอปไม่มีหน้า login ตาม requirement ปัจจุบัน ผู้ใช้ที่เข้าถึงเว็บสามารถแก้ไขและลบเกมได้ โปรดอ่านข้อจำกัดและ known risks ใน `PROJECT_HANDOFF.md` ก่อนเปลี่ยน persistence หรือ security model
