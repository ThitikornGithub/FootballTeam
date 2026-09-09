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

- สร้างตารางพบกันหมดและนับจำนวนครั้งที่แต่ละคู่เจอกัน เพื่อแนะนำคู่ที่เล่นน้อยที่สุดเมื่อจัดใหม่หรือกดเล่นต่อ (ค่าเริ่มต้น 7 นาทีพัก 1 นาที)
- เลือกเวลาเริ่ม/จบ ระยะเวลาแข่ง เวลาพัก และกำหนดคู่เปิดสนามหรือเกมถัดไป โดยเกมที่กำลังแข่งจะถูกล็อก พร้อมแสดงจำนวนครั้งที่พบกันและคู่แนะนำ
- ตารางเวลารองรับการแข่งขันข้ามเที่ยงคืนและระบุ `+1 วัน` ให้เห็นชัดในหน้า Home ตารางแข่งขัน รายละเอียดแมตช์ และข้อความแชร์
- จัดการทีม ผู้เล่น ลำดับ และสถานะขาดวันนี้
- สุ่ม GK แยกทีม พร้อมรอบใหม่และการข้ามคิว
- บันทึกสกอร์ สรุปตารางคะแนน และเพิ่มเกมเมื่อเล่นต่อเกินเวลา
- แก้สกอร์ ยกเลิกผล เริ่ม/จบแมตช์ และดูคิว GK
- วางแผนบนกระดาน tactic แบบตำแหน่งนิ่งหรือ Animation เลือก 5/6/7 คนและ formation ได้
- แชร์รูปตารางคะแนนผ่าน Web Share API ดาวน์โหลด PNG หรือคัดลอกข้อความ
- หน้ารวมเกมทั้งหมดที่ `/FootballTeam/allgames` พร้อมเปิดและลบเกม โดยป้องกันคำขอเก่าดึงผู้ใช้กลับเข้าเกมหลังจากกด Back
- เก็บ state ของเกมใน Neon Postgres ผ่าน Neon Data API พร้อม revision conflict protection; LocalStorage เป็นเพียง backup โดยเก็บเกมที่ซิงก์แล้วล่าสุดไม่เกิน 12 เกม และไม่ลบ backup ที่ยังรอซิงก์
- ป้องกันผลลัพธ์รายการเกมเก่าทำให้เกมที่ลบแล้วกลับมาแสดงชั่วคราว

แอปไม่มีหน้า login ตาม requirement ปัจจุบัน ผู้ใช้ที่เข้าถึงเว็บสามารถแก้ไขและลบเกมได้ โปรดอ่านข้อจำกัดและ known risks ใน `PROJECT_HANDOFF.md` ก่อนเปลี่ยน persistence หรือ security model
