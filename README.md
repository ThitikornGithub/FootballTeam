# Football Match Maker

Mobile-first web app สำหรับจัดตารางฟุตบอลแบบ round robin บน 1 สนาม หมุนเวียนผู้รักษาประตู บันทึกสกอร์ ตารางคะแนน และวางแผนบนกระดาน tactic

- Production: <https://thitikorngithub.github.io/FootballTeam/> (deployment เดียวของโปรเจกต์)
- Repository: <https://github.com/ThitikornGithub/FootballTeam>
- เว็บแชร์แยกบนโดเมน `*.chatgpt.site` เลิกใช้แล้วและตอบ 404 ทั้งหมด ลิงก์แชร์อิง origin
  ที่เปิดอยู่จริง จึงต้องเปิดแอปจาก URL production ด้านบนเมื่อจะส่งลิงก์ให้เพื่อน
- เอกสาร architecture, persistence, security model, audit findings และแนวทางส่งต่องาน: [PROJECT_HANDOFF.md](./PROJECT_HANDOFF.md)

## Run locally

แนะนำ Node.js 24 (ตรงกับ GitHub Actions)

```bash
npm install
npm run dev
```

เปิด `http://localhost:3000`

## Check before release

```bash
npm test
npm run test:db
npm run lint
./node_modules/.bin/tsc --noEmit
npm run test:e2e
GITHUB_PAGES=true \
NEXT_PUBLIC_BASE_PATH=/FootballTeam \
NEXT_PUBLIC_SITE_URL=https://thitikorngithub.github.io \
npm run build
```

## Local browser tests

เพิ่มชุดทดสอบด้วยข้อมูลจำลองที่เปิดแอปเฉพาะ `localhost:3210` และบล็อกเครือข่ายภายนอก ทุก RPC ของ Neon ตอบจากข้อมูลในหน่วยความจำ ไม่มีการใช้ข้อมูลเกมจริงหรือ deploy อัตโนมัติ

```bash
npx playwright install chromium webkit
npm run test:e2e
```

หากมี Google Chrome แล้ว ใช้ `PLAYWRIGHT_CHANNEL=chrome npm run test:e2e` ได้ (ยังต้องติดตั้ง WebKit) หรือเลือกเฉพาะ Chromium ด้วย `-- --project=chromium` ดูขอบเขตใน [tests/e2e/README.md](./tests/e2e/README.md) รอบล่าสุดผ่าน 35 เคส รวม WebKit มือถือจำลอง 3 เคส ไม่มี expected failures

GitHub Actions รัน lint/typecheck, engine, DB ในหน่วยความจำ และ browser tests ก่อน build/deploy ทุกครั้ง หากตรวจไม่ผ่านจะไม่ deploy พร้อมเก็บรายงานเมื่อ browser tests ล้มเหลว PR จะตรวจชุดทดสอบโดยไม่ deploy หลังสร้าง static pages ยังมี `npm run check:pages` ตรวจไฟล์ assets, รูป OG และเส้นทาง fallback แบบ offline

การทดสอบ SQL ใช้ PostgreSQL ในหน่วยความจำผ่าน `npm run test:db` และไม่เชื่อมต่อ Neon ดูขั้นตอนตรวจ/ติดตั้ง migration จริงใน [db/README.md](./db/README.md)

## Main features

- สร้างตารางแบบ B: พบกันครบทุกคู่ พร้อมมองตลอดคิวที่เหลือเพื่อกระจายจำนวนเกม การเล่นติดกัน และการรอพัก ไม่บังคับวนลำดับเซ็ตเดิม (ค่าเริ่มต้น 7 นาทีพัก 1 นาที)
- ตารางเรียงเซ็ตตามเวลา หัวเซ็ตแบบ compact; พับเฉพาะเซ็ตที่จบแล้วไว้ตำแหน่งเดิมและกดดูผลได้ เซ็ตที่ยังไม่จบเปิดเสมอ กดเสื้อ/ชื่อทีม/ช่องผลเพื่อกรอกสกอร์เร็วใน popup หรือกดเลขแมตช์/เวลาเพื่อเปิดรายละเอียดเต็ม
- หน้าตารางของเกมที่แชร์มีปุ่มดึงข้อมูลล่าสุดด้านบน ใช้ได้แม้เปิดแบบ Add to Home Screen โดยไม่ต้องหาเมนู refresh ของเบราว์เซอร์
- ทีมซ้าย–ขวาของแต่ละคู่ยึดการพบกันครั้งแรก สกอร์และ GK แสดงตามทีมเดิม ไม่เปลี่ยนตามสีเสื้อหรือการสลับคิว
- เลือกเวลาเริ่ม/จบ ระยะเวลาแข่ง เวลาพัก และกำหนดคู่เปิดสนามหรือเกมถัดไป โดยเกมที่กำลังแข่งจะถูกล็อก พร้อมแสดงจำนวนครั้งที่พบกันและคู่แนะนำ; การแก้ชื่อ/เวลา/สีอย่างเดียวไม่สับคิวคู่เดิม
- ตารางเวลารองรับการแข่งขันข้ามเที่ยงคืนและระบุ `+1 วัน` ให้เห็นชัดในหน้า Home ตารางแข่งขัน รายละเอียดแมตช์ และข้อความแชร์
- จัดการทีม ผู้เล่น ลำดับ และสถานะขาดวันนี้
- สุ่ม GK แยกทีม พร้อมรอบใหม่และการข้ามคิว
- บันทึกสกอร์ สรุปตารางคะแนน และเพิ่มเกมเมื่อเล่นต่อเกินเวลา
- ตารางคะแนนบนเว็บและรูปแชร์แสดง F (ประตูที่ยิงได้) และ A (ประตูที่เสีย) แยกจากผลต่างประตู (+/-)
- แก้สกอร์ ยกเลิกผล เริ่ม/จบแมตช์ และดูคิว GK
- วางแผนบนกระดาน tactic แบบตำแหน่งนิ่งหรือ Animation เลือก 5/6/7 คนและ formation ได้
- แชร์รูปตารางคะแนนผ่าน Web Share API ดาวน์โหลด PNG หรือคัดลอกข้อความ; ก่อนมีผลแข่งจะไม่แสดงทีมใดเป็นผู้นำ
- หน้ารวมเกมทั้งหมดที่ `/FootballTeam/allgames` พร้อมเปิดและลบเกม โดยป้องกันคำขอเก่าดึงผู้ใช้กลับเข้าเกมหลังจากกด Back
- เกมสร้างก่อนวันนี้ที่ยังไม่ปิดมีป้ายเตือนและใช้ “ยังไม่จบ” แทน LIVE โดยไม่ปิดหรือเขียนข้อมูลเกมเอง เกมข้ามเที่ยงคืนยังแสดง LIVE ได้จนถึงเวลาจบตามแผน
- เก็บ state ของเกมใน Neon Postgres ผ่าน Neon Data API พร้อม revision conflict protection; LocalStorage เป็นเพียง backup โดยเก็บเกมที่ซิงก์แล้วล่าสุดไม่เกิน 12 เกม และไม่ลบ backup ที่ยังรอซิงก์
- การสร้างเกมใช้เลขคำขอประจำร่างผ่าน `create_football_game_v2`: ถ้า DB สร้างแล้วแต่คำตอบหาย การลองซ้ำจะคืนเกมเดิม การสร้างใหม่จากการตั้งค่าเดิมยังเป็นอีกเกมหนึ่งได้ ต้องติดตั้ง `20261031_idempotent_create.sql` ก่อน deploy client ใหม่นี้ตาม [db/README.md](./db/README.md)
- ป้องกันผลลัพธ์รายการเกมเก่าทำให้เกมที่ลบแล้วกลับมาแสดงชั่วคราว
- เมื่อยืนยันว่าเกมถูกลบจากอีกเครื่อง จะหยุดแก้ไข/บันทึกและแสดงข้อความถาวร พร้อมเก็บ pending backup และให้เปิดข้อมูลที่ยังไม่บันทึกเป็นเกมร่างได้
- เปิด game/allgames path ได้แม้ browser storage ถูกบล็อก โดยใช้ redirect hint ชั่วคราวแล้วคืน URL เดิม
- F/A สามหลักไม่ล้นคอลัมน์บนจอ 320px; ค่าสูงตั้งแต่สี่หลักขึ้นไปเลื่อนเฉพาะตารางในแนวนอนได้

ผล `npm audit` ล่าสุด 31 ตุลาคม: **0 vulnerabilities** ถอดแพ็กเกจ CLI `shadcn` ที่ไม่ได้ใช้ตอนรันแอป และเก็บ CSS เดิมแบบ verbatim พร้อม MIT license ใน `app/vendor/shadcn-tailwind.css` แทน ไม่มีการอัปเดต CSS/เปลี่ยนหน้าตาไปพร้อมกัน หากเพิ่ม UI components ในอนาคต ให้ตรวจ generator แยกก่อน ไม่เพิ่ม CLI กลับเข้า runtime โดยอัตโนมัติ

การตรวจบน iPhone จริงยังแยกจากผล WebKit จำลอง ดู [รายการตรวจบนเครื่องจริง](./tests/e2e/REAL_DEVICE_CHECKLIST.md) GitHub Pages ยังอาจตอบ 404 ก่อน redirect สำหรับ URL นอกชุด static pages; ไม่มีการย้าย hosting หรือเพิ่มระบบ login ในรอบนี้

แอปไม่มีหน้า login ตาม requirement ปัจจุบัน ผู้ใช้ที่เข้าถึงเว็บสามารถแก้ไขและลบเกมได้ โปรดอ่านข้อจำกัดและ known risks ใน `PROJECT_HANDOFF.md` ก่อนเปลี่ยน persistence หรือ security model

วิธี B ใช้เมื่อสร้างตารางหรือเปลี่ยนการเลือกคู่ใน Settings เท่านั้น การบันทึกการตั้งค่าอื่นจะคงคู่ที่บันทึกไว้ (แต่การเปลี่ยนช่วงเวลาอาจเพิ่ม/ลดจำนวนแมตช์); การกดเล่นต่อคงแมตช์เดิมทั้งหมดแล้วเลือกคู่เพิ่มเท่านั้น คู่ที่เลือกเองยังมีสิทธิ์เหนือแผนอัตโนมัติ จึงอาจทำให้การพักหรือจำนวนคู่ในแต่ละเซ็ตไม่สมดุลได้ ไม่ต้องทำ DB migration เพื่อใช้การแก้ไขรอบนี้
