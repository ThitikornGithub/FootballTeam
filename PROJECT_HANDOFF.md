# FootballTeam — Project Handoff

อัปเดตล่าสุด: 6 กันยายน 2026  
ขอบเขตการตรวจ: source code, scheduling engine, Neon persistence, GitHub Pages deployment, dependency audit และข้อมูลที่อยู่ใน Neon ณ วันที่ตรวจ  
สถานะโค้ดที่ใช้ตรวจ: working tree สำหรับรอบ bug-fix วันที่ 6 กันยายน 2026

## 1. ภาพรวมโปรเจกต์

FootballTeam เป็น mobile-first web app สำหรับกลุ่มเพื่อนที่เล่นฟุตบอลสนามเดียว ผู้ใช้ทุกคนที่เข้าถึงเว็บสามารถสร้าง เปิด แก้ไข แชร์ และลบเกมได้โดยไม่มีหน้า login

ความสามารถหลัก:

- สร้างตารางแบบ round robin และวนรอบต่อจนเต็มช่วงเวลาที่กำหนด
- ค่าเริ่มต้น 4 ทีม เวลา 19:00–22:00 แข่ง 7 นาที พัก 1 นาที
- เลือกคู่แรกตอนสร้างเกม และเลือก 1–2 คู่ถัดไปจากหน้าตั้งค่า
- จัดการรายชื่อผู้เล่น สถานะมาวันนี้/ขาดวันนี้ และคิวผู้รักษาประตูแยกตามทีม
- ใส่สกอร์ จบเกม แก้สกอร์ ยกเลิกผล และเพิ่มเกมเมื่อเล่นต่อ
- ตารางคะแนน 3/1/0 แต้ม เรียงด้วยแต้ม ผลต่างประตู และประตูได้
- กระดาน tactic สำหรับสองทีม พร้อมตำแหน่งผู้เล่น ลูกบอล และโน้ต
- สร้างรูปตารางคะแนน แชร์ผ่าน Web Share API ดาวน์โหลด PNG หรือคัดลอกข้อความ
- หน้ารวมเกมทั้งหมด เปิดเกมเดิม และลบเกมออกจาก Neon
- ลิงก์เกมเป็น path เช่น `/FootballTeam/game20260906-1`

Production URL: <https://thitikorngithub.github.io/FootballTeam/>  
Repository: <https://github.com/ThitikornGithub/FootballTeam>

## 2. Architecture

```text
GitHub Pages (static Vinext/React app)
          |
          | HTTPS + public JWT
          v
Neon Data API / PostgREST RPC
          |
          v
public.football_games (Postgres, one JSONB state per game)
```

ไม่มี application server หรือ Vercel Function อยู่กลางทาง ตัว browser เรียก Neon Data API โดยตรง

Technology:

- React 19 + TypeScript
- Vinext/Vite static export
- Tailwind CSS + Shadcn primitives
- Neon Postgres + Neon Data API
- GitHub Actions + GitHub Pages
- Canvas API สำหรับสร้างรูปตารางคะแนน

## 3. Source map

| Path                                    | Responsibility                                                                                            |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `components/football/football-app.tsx`  | หน้าหลักทั้งหมด, navigation, setup, teams, schedule, score, settings, share, game list และ sync lifecycle |
| `components/football/tactics-board.tsx` | กระดาน tactic และ pointer/touch interaction                                                               |
| `components/football/shared.tsx`        | header, bottom navigation, team colors และ shared controls                                                |
| `lib/football-engine.ts`                | scheduling, match status, score, standings, overtime และ GK assignment                                    |
| `lib/football-types.ts`                 | domain types ทั้งหมด                                                                                      |
| `lib/football-data-api.ts`              | Neon Data API endpoint, public credential และ RPC client                                                  |
| `lib/football-schema.ts`                | Runtime validation ของ state ที่มาจาก DB/local backup                                                     |
| `lib/standings-share-card.ts`           | วาดและ export PNG ตารางคะแนน                                                                              |
| `lib/demo-data.ts`                      | ข้อมูลตัวอย่าง 4 ทีม                                                                                      |
| `db/neon-schema.sql`                    | table, RPC functions และ grants ของ Neon                                                                  |
| `scripts/verify-engine.ts`              | engine smoke checks                                                                                       |
| `scripts/github-pages-404.html`         | redirect deep path ของ GitHub Pages กลับเข้า SPA                                                          |
| `.github/workflows/deploy-pages.yml`    | build และ deploy ทุกครั้งที่ push `main`                                                                  |
| `next.config.ts`                        | static export และ `/FootballTeam` asset prefix                                                            |

`components/ui/` ส่วนใหญ่เป็น generated UI catalog ไม่ใช่ทุกไฟล์ที่ถูกใช้งานจริง หลีกเลี่ยงการแก้ทั้งโฟลเดอร์โดยไม่จำเป็น

## 4. Domain model

ข้อมูลหนึ่งเกมถูกเก็บเป็น `Tournament` ก้อนเดียว:

- `id`, `name`, `createdAt`
- `teams[]`
  - team id, name, shirt color
  - `players[]` และ `absentToday`
  - `gkRotation[]`, `gkCycleOrders[][]`
- เวลาเริ่ม ระยะเวลาแข่ง เวลาพัก และเวลาที่มีทั้งหมด
- `matches[]`
  - คู่ทีม เวลา ลำดับและรอบ
  - status: `upcoming | current | finished`
  - score และ GK ของทั้งสองทีม
- `tactics`
  - สองทีมที่เลือก
  - player/ball markers เป็นพิกัดเปอร์เซ็นต์
  - notes

ฐานข้อมูลเก็บ state นี้ใน `public.football_games.state` แบบ JSONB พร้อม `revision`, `created_at`, `updated_at`

## 5. Persistence และ sync

Neon เป็น source of truth สำหรับเกมที่มี Game ID ส่วน `localStorage` เป็น best-effort backup เท่านั้น

RPC ที่ browser เรียกได้:

- `create_football_game`
- `get_football_game`
- `save_football_game` (legacy compatibility)
- `save_football_game_v2` (optimistic revision check)
- `list_football_games`
- `delete_football_game`

พฤติกรรมปัจจุบัน:

1. เมื่อเปิด deep link แอปโหลด state จาก Neon
2. เมื่อแก้ state แอปเขียน local backup ทันที เก็บ save queue และ debounce 450 ms
3. การบันทึกใช้ `save_football_game_v2(p_expected_revision)` เพื่อป้องกันการเขียนทับข้ามเครื่อง
4. เมื่อ page ถูกซ่อนหรือปิด มี keepalive flush เพื่อพยายามส่ง state ล่าสุด
5. แอป poll Neon ทุก 15 วินาทีเฉพาะตอนหน้า visible และไม่ apply remote ขณะมี local dirty state
6. ถ้า revision ชนกันจะแสดงตัวเลือก “ใช้ข้อมูลล่าสุด” หรือ “เก็บข้อมูลเครื่องนี้”
7. สถานะบนหน้า Home คือ `กำลังบันทึก`, `บันทึกแล้ว`, `ซิงก์ไม่สำเร็จ`, `ข้อมูลชนกัน` หรือ `เฉพาะเครื่อง`

Migration ที่ apply แล้วอยู่ใน `db/migrations/20260906_sync_integrity.sql`; ต้อง apply migration นี้ก่อน deploy frontend ที่เรียก v2

## 6. URL และ routing

- Root `/FootballTeam/` เปิดหน้าเริ่มต้น 3 ปุ่มเสมอ
- Game URL ใช้ `/FootballTeam/gameYYYYMMDD-N`
- GitHub Pages ไม่มี SPA rewrite จริง จึงใช้ `404.html` เก็บ path ใน `sessionStorage`, redirect ไป root แล้ว React คืน path ก่อนอ่าน Game ID
- มี `popstate` listener แล้ว ดังนั้น Back/Forward จะโหลด game หรือกลับ Home ให้ตรงกับ URL

## 7. Security model ที่ตั้งใจไว้

- ไม่มี login และไม่มีการแบ่ง viewer/organizer
- JWT ใน client เป็น public shared credential ไม่ใช่ secret
- table ถูก revoke direct access และให้ anonymous role เรียกเฉพาะ RPC functions
- public JWKS อยู่ใน `public/football-jwks.json`; private signing key ต้องไม่อยู่ใน repository
- Game ID เป็นเลขรันรายวันและเดาได้ตามที่เจ้าของโปรเจกต์ยอมรับ
- ผู้ใช้ทุกคนที่เปิดเว็บสามารถดูรายการเกมทั้งหมด แก้เกม และลบเกมถาวรได้
- CORS ลดการเรียกจาก browser origin อื่น แต่ไม่ใช่ authorization และไม่ป้องกันการเรียกด้วย script/curl

ระบบนี้เหมาะกับข้อมูลเล่นสนุกในกลุ่มเล็กตาม requirement ปัจจุบัน ไม่เหมาะกับข้อมูลส่วนตัวหรือการเปิดให้คนทั่วไปใช้โดยไม่มี rate limit/authorization เพิ่มเติม

## 8. Local development และ release

ต้องใช้ Node.js 22.13 ขึ้นไป; GitHub Actions ใช้ Node 24

```bash
npm install
npm run dev
```

ตรวจ engine และ source ก่อน release:

```bash
./node_modules/.bin/jiti scripts/verify-engine.ts
npm run lint
./node_modules/.bin/tsc --noEmit
GITHUB_PAGES=true \
NEXT_PUBLIC_BASE_PATH=/FootballTeam \
NEXT_PUBLIC_SITE_URL=https://thitikorngithub.github.io \
npm run build
```

การ deploy ทำอัตโนมัติเมื่อ push เข้า `main` ผ่าน `.github/workflows/deploy-pages.yml`

Schema ของ Neon ไม่ได้ apply โดย GitHub Actions หากแก้ `db/neon-schema.sql` ต้องตรวจและ apply ใน Neon SQL Editor แยกต่างหาก

`.env.local` และ `.neon` ถูก ignore จาก Git และมีไว้สำหรับ Neon CLI/local administration ไม่ควร commit connection strings หรือ private key

## 9. Audit result — current data

ผลตรวจแบบ read-only วันที่ 6 กันยายน 2026:

- ตรวจ 1 เกมที่อยู่ใน Neon
- Game ID และ `state.id` ตรงกัน
- ไม่พบ duplicate team, player หรือ match IDs
- ไม่พบ self-match หรือ match ที่อ้างทีมที่หายไป
- ไม่พบ score ติดลบ ไม่เป็น integer หรือมี score เพียงฝั่งเดียว
- ไม่พบหลาย match ที่เป็น `current` พร้อมกัน
- tactics อ้างทีมและพิกัดที่ถูกต้อง

ข้อมูลที่อยู่ในฐานข้อมูล ณ เวลาตรวจไม่พบความเสียหาย

Automated checks ที่ผ่าน:

- Oxlint
- TypeScript `--noEmit`
- Engine smoke checks: defaults, round-robin repeats, time window, score, standings, overtime, GK fairness และ reopen match
- GitHub Pages production build ด้วย Node 24 ในรอบ audit นี้
- `npm audit`: 0 vulnerabilities หลังอัปเดต React 19.2.8, Vinext 1.0.0-beta.9, Vite 8.2.2, Cloudflare Vite plugin 1.54.4 และ Wrangler 4.129.0
- Neon transaction smoke test: save ด้วย revision ปัจจุบันคืน `conflict=false`, revision เก่าคืน `conflict=true` และ rollback แล้ว
- Local UI smoke test ที่ 320px: Home, score input, standings table, schedule, tactics marker และ player controls ไม่ล้นขอบ

ยังไม่มี automated browser/E2E tests และรอบ audit นี้ไม่ได้แทนการทดสอบ touch/share sheet บนอุปกรณ์จริง

## 10. Resolved findings และ known limitations

รายการ P1/P2 ที่ตรวจพบในรอบก่อนถูกแก้แล้ว: revision CAS และ conflict UI, serialized save queue/retry, local draft recovery, safe match transition, tactic roster reconciliation, runtime schema validation, responsive score/table/player controls, score cap ที่ 99, settings copy, `popstate` history, และ `npm test`

ข้อจำกัดที่ยังตั้งใจคงไว้:

- GitHub Pages ไม่มี server-side rewrite จริง จึงอาจตอบ 404 ชั่วครู่เมื่อเปิด `/FootballTeam/game...` โดยตรงก่อน `404.html` redirect กลับเข้า SPA
- ยังไม่มี automated browser/E2E suite; รอบนี้มี local UI smoke test ที่ 320px และต้องตรวจ touch/native share บนอุปกรณ์จริงเมื่อมีโอกาส
- แอปเปิดให้ทุกคนที่มีลิงก์แก้ไขและลบได้ตาม requirement กลุ่มเล็ก จึงไม่เหมาะกับข้อมูลสำคัญ

`npm audit` หลังแก้รายงาน 0 vulnerabilities และ production build ผ่าน

## 11. Recommended next work order

1. เพิ่ม browser/E2E contract tests สำหรับ score, sync conflict, reconnect และ deep link
2. พิจารณา hosting ที่รองรับ SPA rewrite หากต้องการ HTTP 200 สำหรับทุก game path และ preview bot
3. เพิ่ม rate limit/authentication หากนำไปใช้นอกกลุ่มเพื่อน

## 12. Rules for the next agent

- Neon เป็น authoritative storage; ห้ามย้อนกลับไปใช้ localStorage เป็น source of truth
- ทุก state-changing flow ต้องรักษา score, finished matches และ Game ID เดิม เว้นแต่เป็นการสร้างเกมใหม่โดยชัดเจน
- อย่าใส่ private Neon database URL หรือ signing private key ลง client/repository
- JWT ปัจจุบันเป็น public app credential โดยตั้งใจ; การเพิ่มข้อมูลสำคัญต้องเปลี่ยน security model ก่อน
- ก่อนแก้ scheduling/GK ให้เพิ่มหรือปรับ assertions ใน `scripts/verify-engine.ts`
- ก่อน deploy ให้รัน lint, typecheck, engine checks และ GitHub Pages production build
- ตรวจ deep-link routing หลังแตะ base path, history หรือ 404 script
- แยกผล simulated/browser QA ออกจาก real-device touch และ native share-sheet testing เสมอ
- Worktree อาจมีงานของคนอื่นอยู่ ห้าม reset/revert การเปลี่ยนที่ไม่เกี่ยวข้อง
