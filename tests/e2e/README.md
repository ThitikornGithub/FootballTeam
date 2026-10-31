# Local browser regression tests

ชุดทดสอบนี้ใช้แอปในเครื่องและข้อมูลสังเคราะห์ทั้งหมด ไม่ต้องใช้บัญชี Neon หรือสำเนาข้อมูลเกมจริง

## Run

แนะนำ Node.js 24 ตาม GitHub Actions แล้วติดตั้ง dependency ด้วย `npm ci`

```bash
npx playwright install chromium webkit
npm run test:e2e
```

หากมี Google Chrome อยู่แล้ว ใช้ได้โดยไม่ต้องดาวน์โหลด browser อีกตัว:

```bash
PLAYWRIGHT_CHANNEL=chrome npm run test:e2e
# เฉพาะ Chromium เมื่อยังไม่มี WebKit
PLAYWRIGHT_CHANNEL=chrome npm run test:e2e -- --project=chromium
```

เปิดรายงานผลครั้งล่าสุด:

```bash
npm run test:e2e:report
```

ตัว runner เปิดและปิด dev server ของตัวเองที่ `http://localhost:3210` ไม่ต้องเปิดแอปเอง ถ้าพอร์ตถูกใช้แล้ว ให้ปิดเฉพาะโปรเซสที่ใช้พอร์ตนั้นก่อน; ชุดทดสอบจะไม่ยืม server ที่เปิดอยู่ ตัวแปร `GITHUB_PAGES` และ `NEXT_PUBLIC_BASE_PATH` ถูกกำหนดเฉพาะ process ทดสอบ ไม่แก้ไฟล์ `.env.local`

## Isolation

- `playwright.config.ts` กำหนด origin เป็น loopback แบบตายตัว ไม่มีตัวเลือกชี้ไป production
- Browser ทุก context ใช้ profile/localStorage ใหม่ และปิด service worker
- `support/fixtures.ts` ติดตั้ง network guard ก่อนสร้าง page
- อนุญาต HTTP ไปยัง origin ของ dev server เท่านั้น RPC ของ Neon ตอบจาก `MockFootballApi` ในหน่วยความจำ รวมทั้ง create/save/delete และ revision conflict ไม่มีการส่งต่อไป Neon
- Host ภายนอกหรือ RPC ที่ไม่รู้จักถูกปิดกั้น และทำให้ test ล้ม Chromium ไม่ resolve DNS ภายนอก ส่วน WebKit ใช้ proxy loopback ที่ปิดอยู่และ bypass เฉพาะ localhost เพื่อจำกัด preconnect ไปยังเครื่องทดสอบ RPC ทั้งสอง project ตอบจาก memory fixture ก่อนถึงเครือข่าย
- Deep link ใช้ `scripts/github-pages-404.html` ของโปรเจกต์ โดยเปลี่ยน base path เป็น local root ใน fixture เท่านั้น
- ฐานข้อมูลจำลองใช้ชื่อ `Test green 1` ฯลฯ และ Game ID `game20260102-1` ข้อมูลจะหายเมื่อจบแต่ละ test
- ตัว runner ไม่แก้ SQL, migration หรือข้อมูลจริง CI เรียกชุดนี้ก่อน build/deploy โดยไม่ใช้ DB credentials; รายงาน failures เก็บใน Actions 7 วัน PR รันเฉพาะ checks

เมื่อเพิ่ม test ให้ import `test` และ `expect` จาก `./support/fixtures` เสมอ หากสร้าง context เพิ่ม ต้องเรียก `api.install(context)` **ก่อน** สร้าง page และปิด context ใน `finally` อย่าใช้ `APIRequestContext`, Node `fetch`, `route.fetch` หรือเครื่องมือ DB เพื่อส่งคำขอภายนอก เพราะคำขอนอก browser ไม่ผ่าน guard นี้

## Coverage

- Home, allgames และ deep link ผ่าน redirect
- สร้างเกมสำเร็จแต่คำตอบหายแล้ว retry/reload ได้เกมเดิม; เก็บสกอร์ที่แก้ก่อน retry/ระหว่างรอ, กดสองครั้งสร้างเกมเดียว, เคารพ revision ใหม่จากอีกเครื่อง, ไม่สร้างเกมที่ถูกลบกลับมา และ copy settings สร้างเกมใหม่ด้วยเลขคำขอใหม่ได้ กรณี storage ใช้ไม่ได้ทดสอบ retry ในแท็บเดิม
- Popup สกอร์ไม่เลือกข้อความเอง, draft อยู่หลัง reload, จบแมตช์แล้วเลื่อนไปคู่ถัดไป, F/A และแต้มตรงทีม
- แก้สกอร์ระหว่าง save ค้างแล้วยังคงค่าล่าสุด
- Save ล้มเหลวรอ backoff และ retry ด้วยค่าล่าสุด
- เปิดกลับมาออฟไลน์ใช้ pending backup และซิงก์เมื่อเชื่อมต่อกลับมา
- สอง context ใช้ revision เก่าแล้วไม่เขียนทับประตูอีกเครื่องเงียบ ๆ
- Refresh รับข้อมูลอีกเครื่อง และการสลับเกมรักษา Game ID/สกอร์แยกกัน
- เปลี่ยนชื่อ/สลับสีเสื้อใน Settings โดยคู่แข่ง เวลา และลำดับผู้เล่น/GK ยังตรงเดิม
- สำรองไม่สำเร็จต้องเตือนตามจริงและค้างไว้จนบันทึกออนไลน์สำเร็จ รวมถึงการสร้างเกมจาก draft
- เกมถูกลบจากอีกเครื่องต้องหยุดแสดง saved/หยุดแก้ไข/หยุด retry และหายจากรายการ; pending backup ยังอยู่และเปิดเป็นเกมร่างได้แม้ storage เต็ม
- เปิด game/allgames ได้เมื่อ browser storage ใช้ไม่ได้ โดยคืน query/hash และ clean path เดิม; redirect hint ภายนอกถูกปฏิเสธ
- F/A สามหลักและผลต่างบวก/ลบต้องไม่ล้นช่องบนจอ 320px
- เมนูมือถือ, กระดาน 14 ผู้เล่น + บอล และรูปแชร์ ที่ 320/480px
- WebKit/iPhone 13 จำลอง: แตะเมนูหลังเลื่อน/เปลี่ยน viewport, popup ไม่ autofocus input, pageshow รับสกอร์ใหม่และ reload เก็บคะแนน, marker drag ไม่เลื่อน document และ canvas รูปแชร์
- เกมเก่าไม่แสดง LIVE/ไม่ถูกแก้ข้อมูลจากการเปิดดู และเกมข้ามเที่ยงคืนยังแสดง LIVE ก่อนเวลาจบ
- Network guard จำลอง RPC ได้โดยไม่ใช้ credential และบล็อกการเปิด production

## Results and remaining scope

ผลรอบ 31 ตุลาคม: 35 เคสผ่านตามปกติ (Chromium 32 + WebKit mobile 3) ไม่มี expected failures; เพิ่ม `game-age.spec.ts` และ `mobile-webkit.spec.ts` ส่วน `create-game.spec.ts` 6 เคสตรวจ create/retry และบั๊กเดิมอยู่ใน `data-integrity.spec.ts`/`routing.spec.ts` Pure assertions ของ `validPagesPath` ใน `scripts/verify-engine.ts` ตรวจทั้ง local root และ production base path `/FootballTeam`

WebKit จำลองไม่ใช่เครื่อง iPhone จริง การลาก marker ใช้ pointer/mouse ใน engine WebKit และตรวจ touch-action ส่วนเมนู/popup ใช้ touch tap ไม่ได้ยืนยัน native keyboard, ล็อกจอจริง หรือ share sheet ผู้ใช้รายงานหลังลองทดสอบว่าโดยรวมใช้งานได้ในวันที่ 31 ตุลาคม 2026 โดยไม่ได้ระบุรุ่น/iOSหรือผลรายข้อ บันทึกแยกเป็น user-reported result ใน [REAL_DEVICE_CHECKLIST.md](./REAL_DEVICE_CHECKLIST.md)

```bash
# เฉพาะข้อมูลและ routing
npm run test:e2e -- data-integrity.spec.ts routing.spec.ts
```

ผลทดสอบนี้ตรวจ browser กับ mock contract ไม่ยืนยัน SQL/permissions ของ Neon, HTTP status ของ GitHub Pages, iPhone จริง หรือ native share sheet ผลลัพธ์และ trace ใน `test-results/`/`playwright-report/` ถูก ignore; `test-results/results.json` เก็บสถานะจริงและ expected status ของแต่ละเคส รอบปัจจุบันทุกเคสต้องผ่านตามปกติ
