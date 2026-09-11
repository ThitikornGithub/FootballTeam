# FootballTeam — Project Handoff

อัปเดตล่าสุด: 11 กันยายน 2026
ขอบเขตการตรวจ: source code, scheduling engine, Neon persistence, GitHub Pages deployment, dependency audit และข้อมูลที่อยู่ใน Neon ณ วันที่ตรวจ  
สถานะโค้ดที่ใช้ตรวจ: working tree สำหรับรอบ responsive player controls, navigation scroll, sync-session race, `/allgames` deep link และ dependency security วันที่ 11 กันยายน 2026

## 1. ภาพรวมโปรเจกต์

FootballTeam เป็น mobile-first web app สำหรับกลุ่มเพื่อนที่เล่นฟุตบอลสนามเดียว ผู้ใช้ทุกคนที่เข้าถึงเว็บสามารถสร้าง เปิด แก้ไข แชร์ และลบเกมได้โดยไม่มีหน้า login

ความสามารถหลัก:

- สร้างตารางแบบ round robin และวนรอบต่อจนเต็มช่วงเวลาที่กำหนด
- ค่าเริ่มต้น 4 ทีม เวลา 19:00–22:00 แข่ง 7 นาที พัก 1 นาที
- เลือกคู่เปิดสนามตอนสร้างเกม และเลือก 1–2 เกมถัดไปจากหน้าตั้งค่า เมื่อเริ่มแข่งแล้วระบบจะเก็บเกม current ไว้และจัด upcoming ใหม่ตาม encounter count พร้อมแนะนำคู่ที่เล่นน้อยที่สุด
- จัดการรายชื่อผู้เล่น ตำแหน่งที่เล่นได้หลายตำแหน่ง สถานะมาวันนี้/ขาดวันนี้ และคิวผู้รักษาประตูแยกตามทีม
- ใส่สกอร์ จบเกม แก้สกอร์ ยกเลิกผล และเพิ่มเกมเมื่อเล่นต่อ
- ตารางคะแนน 3/1/0 แต้ม เรียงด้วยแต้ม ผลต่างประตู และประตูได้
- กระดาน tactic สำหรับสองทีม พร้อมจัดตัวตามตำแหน่ง D/M/W/F ตำแหน่งผู้เล่น และลูกบอล โดยแสดงสนามก่อนและพับค่าผู้เล่น/แผนไว้ด้านล่าง
- สร้างรูปตารางคะแนน แชร์ผ่าน Web Share API ดาวน์โหลด PNG หรือคัดลอกข้อความ
- หน้ารวมเกมทั้งหมด เปิดเกมเดิม และลบเกมออกจาก Neon
- หน้าเกมทั้งหมดอยู่ที่ `/FootballTeam/allgames`; มี static entry ของ path นี้โดยตรง และการกด Back หรือเปลี่ยนหน้าจะยกเลิกผลจากคำขอเปิดเกมเก่าที่ยังโหลดไม่เสร็จ
- Bottom navigation แสดงในหน้าจัดการผู้เล่นด้วย และทางลัดอยู่บนสุดของหน้าตั้งค่า
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

**GitHub Pages เป็น deployment เดียวของโปรเจกต์นี้** เคยมีเว็บแชร์แยกบนโดเมน `*.chatgpt.site`
ที่รัน edge route สำหรับสร้าง OG image ต่อเกม แต่ถอดออกแล้วใน `48c9a09` และโดเมนนั้นตอบ 404
ทั้งหมด ลิงก์แชร์สร้างจาก `window.location.origin` จึงชี้กลับมาที่ GitHub Pages เสมอ
ไม่ต้องตรวจหรือ deploy host ที่สองอีก

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
| `lib/football-engine.ts`                | scheduling, match status, score, scorers, standings, overtime และ GK assignment                           |
| `lib/football-tactics.ts`               | formation definitions, GK selection และ Auto placement จากตำแหน่งผู้เล่น                                  |
| `lib/football-types.ts`                 | domain types ทั้งหมด                                                                                      |
| `lib/football-data-api.ts`              | Neon Data API endpoint, public credential และ RPC client                                                  |
| `lib/football-schema.ts`                | Runtime validation ของ state ที่มาจาก DB/local backup                                                     |
| `lib/standings-share-card.ts`           | วาดและ export PNG ตารางคะแนน                                                                              |
| `app/layout.tsx`                        | metadata, favicon, Open Graph/X social preview และ Neon preconnect                                        |
| `public/og*.jpg`                        | รูป preview เมื่อแชร์ลิงก์เว็บไซต์ผ่านแอปแชตหรือ social platform                                          |
| `lib/demo-data.ts`                      | ข้อมูลตัวอย่าง 4 ทีม                                                                                      |
| `db/neon-schema.sql`                    | table, RPC functions และ grants ของ Neon                                                                  |
| `scripts/verify-engine.ts`              | engine smoke checks                                                                                       |
| `scripts/generate-game-share-pages.tsx` | สร้าง static game share/OG pages และ static entry สำหรับ `/allgames`                                      |
| `scripts/github-pages-404.html`         | redirect deep path ของ GitHub Pages กลับเข้า SPA                                                          |
| `.github/workflows/deploy-pages.yml`    | build และ deploy ทุกครั้งที่ push `main`                                                                  |
| `next.config.ts`                        | static export และ `/FootballTeam` asset prefix                                                            |

`components/ui/` ส่วนใหญ่เป็น generated UI catalog ไม่ใช่ทุกไฟล์ที่ถูกใช้งานจริง หลีกเลี่ยงการแก้ทั้งโฟลเดอร์โดยไม่จำเป็น

## 4. Domain model

ข้อมูลหนึ่งเกมถูกเก็บเป็น `Tournament` ก้อนเดียว:

- `id`, `name`, `createdAt`
- `teams[]`
  - team id, name, shirt color
  - `players[]`, `absentToday` และ `positions[]` (`defender`, `midfielder`, `winger`, `forward`); คิวผู้รักษาประตูจัดการแยกต่างหาก
  - `gkRotation[]`, `gkCycleOrders[][]`
- เวลาเริ่ม ระยะเวลาแข่ง เวลาพัก และเวลาที่มีทั้งหมด (รองรับเวลาจบข้ามเที่ยงคืน)
- `matches[]`
  - คู่ทีม เวลา ลำดับและรอบ
  - status: `upcoming | current | finished`
  - score และ GK ของทั้งสองทีม
  - `scorers[]` เก็บชื่อ snapshot, team/player id และจำนวนประตูของแต่ละคน; นับดาวซัลโวจากแมตช์ที่จบแล้วเท่านั้น
- `tactics`
  - สองทีมที่เลือก
  - match ที่อ้างอิง, จำนวนผู้เล่น 5/6/7, formation และ GK ของแต่ละฝั่ง
  - player/ball markers เป็นพิกัดเปอร์เซ็นต์
  - notes

ฐานข้อมูลเก็บ state นี้ใน `public.football_games.state` แบบ JSONB พร้อม `revision`, `created_at`, `updated_at`

## 5. Persistence และ sync

Neon เป็น source of truth สำหรับเกมที่มี Game ID ส่วน `localStorage` เป็น best-effort backup เท่านั้น

RPC ที่ browser เรียกได้:

- `create_football_game`
- `get_football_game`
- `save_football_game_v2` (optimistic revision check)
- `list_football_games`
- `delete_football_game`

พฤติกรรมปัจจุบัน:

1. เมื่อเปิด deep link แอปโหลด state จาก Neon
2. เมื่อแก้ state แอปเขียน local backup แยกตาม Game ID ทันที เก็บ save queue และ debounce 450 ms เพื่อไม่ให้เกมหนึ่งทับ backup ของอีกเกม โดยเก็บ backup ที่ซิงก์แล้วล่าสุดไม่เกิน 12 เกม ส่วนรายการที่ `pendingSync` จะไม่ถูกล้างอัตโนมัติ
3. การบันทึกใช้ `save_football_game_v2(p_expected_revision)` เพื่อป้องกันการเขียนทับข้ามเครื่อง
4. เมื่อ page ถูกซ่อนหรือปิด มี keepalive flush เพื่อพยายามส่ง state ล่าสุด
5. แอป poll Neon ทุก 15 วินาทีเฉพาะตอนหน้า visible และไม่ apply remote ขณะมี local dirty state
6. ถ้า revision ชนกันจะแสดงตัวเลือก “ใช้ข้อมูลล่าสุด” หรือ “เก็บข้อมูลเครื่องนี้”
7. สถานะบนหน้า Home คือ `กำลังบันทึก`, `บันทึกแล้ว`, `ซิงก์ไม่สำเร็จ`, `ข้อมูลชนกัน` หรือ `เฉพาะเครื่อง`
8. รายการเกมใช้ stale-while-revalidate: แสดง cache อายุไม่เกิน 24 ชั่วโมงทันที แล้วอัปเดตจาก Neon เบื้องหลัง โดยหน้าเริ่มต้นจะ prefetch รายการไว้ล่วงหน้า
9. Neon free compute อาจใช้เวลาหลายวินาทีเมื่อปลุกจากสถานะ idle; หลังตื่นแล้ว RPC ปกติอยู่ระดับหลักสิบถึงหลักร้อยมิลลิวินาที จึงไม่ควรตีความ cold start ว่าเป็นปัญหาจากจำนวนแถวหรือ React render
10. ทุก RPC มี timeout 20 วินาที และ `keepalive` จะใช้เฉพาะ payload ไม่เกิน 60 KiB; หากใหญ่กว่านั้นจะกลับมาซิงก์แบบปกติเมื่อหน้า visible
11. sync session แยกตามเกม คำตอบจาก request เก่าจึงไม่สามารถเปลี่ยน revision, queue หรือสถานะของเกมที่เปิดใหม่ได้
12. รายการเกมมี mutation version และ request token แยกกัน คำตอบจาก list request ที่เริ่มก่อนการลบจึงไม่สามารถนำเกมที่ลบแล้วกลับเข้า cache หรือ UI ได้
13. ทั้ง success และ failure ของ background poll ตรวจ Game ID และ sync session ก่อนเปลี่ยนสถานะ จึงไม่ทำให้เกมใหม่ขึ้น error จาก request ของเกมเก่า

Migration ที่ apply แล้วอยู่ใน `db/migrations/20260906_sync_integrity.sql` และ `db/migrations/20260909_remove_legacy_save.sql`; migration ล่าสุดลบ RPC `save_football_game` ตัวเก่าที่ไม่มี revision check ออกจาก production แล้ว

## 6. URL และ routing

- Root `/FootballTeam/` เปิดหน้าเริ่มต้น 3 ปุ่มเสมอ
- หน้ารวมเกมใช้ `/FootballTeam/allgames` และเปิดตรง/เก็บ bookmark ได้
- Game URL ใช้ `/FootballTeam/gameYYYYMMDD-N`
- ปุ่มคัดลอกลิงก์ประกอบ URL จาก `window.location.origin` เท่านั้น ห้าม hardcode โดเมนอื่น
  มิฉะนั้นลิงก์ที่ส่งให้เพื่อนจะชี้ไป host ที่ไม่ได้ deploy
- `/FootballTeam/allgames` มี static `allgames/index.html` redirect entry จึงเปิด bookmark นี้ได้โดยไม่ต้องเริ่มจาก HTTP 404
- Game path ที่ไม่ได้ pre-generate ยังใช้ `404.html` เก็บ path ใน `sessionStorage`, redirect ไป root แล้ว React คืน path ก่อนอ่าน Game ID เพราะ GitHub Pages ไม่มี SPA rewrite จริง
- มี `popstate` listener แล้ว ดังนั้น Back/Forward จะโหลด game หรือกลับ Home ให้ตรงกับ URL และจะ invalidate คำขอเปิดเกมเดิมเมื่อผู้ใช้กลับ Home หรือหน้าเกมทั้งหมด
- เมื่อลบเกมปัจจุบันจากหน้าเกมทั้งหมด แอปจะคง URL `/FootballTeam/allgames` และหน้ารายการไว้; หากผู้ใช้เปลี่ยนหน้าไประหว่างลบจะยึด route ล่าสุดแทน

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

ผลตรวจแบบ read-only วันที่ 11 กันยายน 2026:

- ตรวจ 4 เกมที่อยู่ใน Neon
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
- Engine smoke checks: defaults, round-robin repeats, time window, score, scorers/Top 3, standings, overtime, GK fairness, tactics formation และ reopen match
- GitHub Pages production build ด้วย Node 24 ในรอบ audit นี้
- `npm audit --omit=optional`: 0 vulnerabilities หลังอัปเดต React 19.2.8, Vinext 1.0.0-beta.9, Vite 8.2.2, Cloudflare Vite plugin 1.54.7, Wrangler 4.131.0, Sharp 0.35.4 และ Cloudflare Workers Types 5.20260911.1
- Neon transaction smoke test: save ด้วย revision ปัจจุบันคืน `conflict=false`, revision เก่าคืน `conflict=true` และ rollback แล้ว
- Local UI smoke test ที่ 320px: Home, standings, schedule, settings และหน้าจัดการผู้เล่นไม่ล้นขอบ ปุ่มลบยังมองเห็นครบ ตัวเลือกตำแหน่งแบบ compact มีพื้นขาวทึบ และเปลี่ยนเมนูแล้ว scroll กลับด้านบน
- Local browser smoke วันที่ 9 กันยายน: scorer popup, share card, tactics 5/7 คน, formation, animation, standings ที่ 320px และ tactics autosave หลังสลับหน้าผ่านทั้งหมด
- Mocked sync race วันที่ 9 กันยายน: ขณะ save เกม A ค้าง สามารถสร้างและแก้เกม B ได้โดยแต่ละ request และ local backup ยังชี้ Game ID ถูกต้อง
- Navigation race วันที่ 9 กันยายน: คำขอเปิดเกมที่ช้าจะถูกยกเลิกเชิงตรรกะเมื่อกด Back และไม่สามารถเปิดเกมกลับมาเองได้
- Game-list delete race วันที่ 9 กันยายน: list response ที่เริ่มก่อน delete จะไม่สามารถเขียนเกมที่ลบแล้วกลับเข้า cache; spinner/request ของหน้าเดิมถูก invalidate หลังลบสำเร็จ
- Next-day display วันที่ 9 กันยายน: เวลาหลังเที่ยงคืนแสดง `(+1 วัน)` ในหน้า Home ตารางแข่งขัน รายละเอียดแมตช์ และข้อความแชร์
- Local backup retention วันที่ 9 กันยายน: ล้างเฉพาะ backup ที่ซิงก์แล้วซึ่งเกิน 12 เกม และรักษาทุก backup ที่ยังรอซิงก์
- Neon production ยืนยันว่า legacy `save_football_game(text,jsonb)` ถูกลบแล้ว และเกมทั้ง 4 รายการยังโหลดผ่าน runtime schema

ยังไม่มี browser/E2E suite ที่ commit อยู่ใน repository; smoke scripts รอบ audit เป็น ad-hoc และไม่ได้แทนการทดสอบ touch/share sheet บนอุปกรณ์จริง

## 10. Resolved findings และ known limitations

รายการ P1/P2 ที่ตรวจพบในรอบก่อนถูกแก้แล้ว: revision CAS และ conflict UI, serialized save queue/retry, local draft recovery, safe match transition, tactic roster reconciliation, runtime schema validation, responsive score/table/player controls, score cap ที่ 99, settings copy, `popstate` history, dialog/select contrast, การลบเกมจาก Settings ให้ลบ Neon จริง, game-list request deduplication และ `npm test`

รอบล่าสุดแก้ navigation/delete edge cases เพิ่มแล้ว: กด Back ระหว่างเปิดเกมจะไม่ถูก request เก่าดึงกลับ, การลบเกมปัจจุบันจาก `/allgames` จะไม่ทำให้ URL กับหน้าจอไม่ตรงกัน, และผล list request เก่าจะไม่ทำให้เกมที่ลบแล้วกลับมาแสดงชั่วคราว

รอบวันที่ 11 กันยายนเพิ่มการป้องกัน failure จาก background poll ของเกมเก่าไม่ให้เปลี่ยนสถานะของเกมใหม่, รีเซ็ต scroll เมื่อเปลี่ยนเมนูหลัก, ทำแถวผู้เล่นที่หน้าจอต่ำกว่า 390px ให้ใช้ตัวเลือกตำแหน่งแบบ compact โดยไม่ตัดปุ่มลบ และสร้าง static entry สำหรับ `/FootballTeam/allgames`

ตารางแข่งขันแสดงเลข Match แยกจากเวลา และเรียงรายการที่แข่งแล้วจากเก่าไปใหม่เพื่อให้รายการล่าสุดอยู่ล่างสุด

ตารางและจุดแสดงเวลาหลักระบุ `(+1 วัน)` เมื่อเวลาเลยเที่ยงคืนแล้ว เพื่อไม่ให้เวลา `00:xx` ถูกเข้าใจว่าอยู่ก่อนเวลาเริ่มของวันเดิม

กระดานแท็กติกแสดงสนามก่อน และเริ่มต้นที่ 7 คนต่อทีม ส่วนเลือกสองทีม จำนวนผู้เล่น 5/6/7, formation และตัวสำรองพับอยู่ใน dropdown ด้านล่าง การเปลี่ยนจำนวนคนหรือ formation จะจัดผู้เล่นบนสนามใหม่ทันที โดยวางผู้เล่นหนึ่งคนไว้บริเวณหน้าประตูอัตโนมัติแต่ไม่ติดป้าย GK บนกระดาน หน้า UI ไม่แสดงตัวเลือกแมตช์ ช่องเลือก GK หรือช่องโน้ตแล้ว แต่ยังคง field เดิมไว้เพื่อ backward compatibility รูปแชร์สรุปดาวซัลโว Top 3 จาก `scorers[]` ของแมตช์ที่จบแล้ว ส่วนชื่อผู้ยิงเป็นข้อมูล optional เปิดกรอกผ่าน popup จากปุ่มเดียว และซิงก์ไปพร้อม state ของเกม

หากทีมหนึ่งถูกระบุว่า `absentToday` ครบทุกคน กระดานแท็กติกจะ fallback มาใช้รายชื่อทั้งทีม และหากทีมนั้นยังไม่มีรายชื่อจะใช้ marker `P1`–`P7` ตามจำนวนคนที่เลือก เพื่อไม่ให้ผู้เล่นฝั่งนั้นหายทั้งชุด กระดาน reconcile เมื่อ roster หรือ tactics ล่าสุดจาก Neon เปลี่ยน และ autosave หลังแก้ประมาณ 700 ms; ปุ่มบันทึกแผนยังใช้บันทึกทันทีได้

เมื่อเปิด Animation การสร้าง/เลือก/ตั้งชื่อจังหวะ เครื่องมือวาดเส้น ปุ่มย้อน–Play–ถัดไป แถบสถานะ และตัวเลือกแสดงลูกศรจะรวมอยู่ในการ์ดควบคุมเดียวเหนือสนาม ไม่แยก Playback ไว้ท้ายหน้า

การเปิด game path ที่เคยเข้าแล้วใช้ stale-while-revalidate: แสดง local backup ทันทีพร้อมสถานะ `กำลังอัปเดต` แล้วโหลด revision ล่าสุดจาก Neon เบื้องหลัง หากมี local pending/edit ระหว่างโหลดจะเทียบกับ remote ก่อนและเปิด conflict dialog แทนการเขียนทับ ส่วนการเข้าเกมครั้งแรกบนอุปกรณ์ยังต้องรอ Neon เพราะยังไม่มีข้อมูลสำรอง

Runtime parser ตรวจ marker ID/ลูกบอล/ทีมของผู้เล่นในกระดาน และซ่อม reference ของผู้เล่นหรือแมตช์ที่ถูกลบโดยเก็บชื่อผู้ยิงในประวัติไว้ ทำให้ reference เก่าไม่ทำให้ทั้งเกมโหลดไม่ได้

Scheduling หลังเริ่มแข่งใช้จำนวนครั้งที่คู่ทีมพบกันเป็นเกณฑ์หลัก แล้วหลีกเลี่ยงทีมเดิมเล่นสามเกมติดและลดการลงต่อเนื่องเป็นเกณฑ์รอง ปุ่ม “เล่นต่ออีก 1 เกม” นับทั้ง schedule ปัจจุบันก่อนเลือกคู่เพิ่ม ส่วนคู่ที่ผู้ใช้เลือกเองเป็น hard preference; UI จึงแสดงคู่แนะนำและจำนวนครั้งที่พบกันเพื่อเตือนเมื่อเลือกต่างจากแผนสมดุล

ข้อจำกัดที่ยังตั้งใจคงไว้:

- GitHub Pages ไม่มี server-side rewrite จริง จึงอาจตอบ 404 ชั่วครู่เมื่อเปิด game path ที่อยู่นอกชุด static pages ซึ่ง workflow เตรียมย้อนหลัง 1 วันและล่วงหน้า 45 วัน วันละ 12 Game ID; game ที่มีอยู่ใน Neon จะถูกสร้าง static page ทุกครั้งที่ deploy/nightly run
- ยังไม่มี automated browser/E2E suite; รอบนี้มี local UI smoke test ที่ 320px และต้องตรวจ touch/native share บนอุปกรณ์จริงเมื่อมีโอกาส
- แอปเปิดให้ทุกคนที่มีลิงก์แก้ไขและลบได้ตาม requirement กลุ่มเล็ก จึงไม่เหมาะกับข้อมูลสำคัญ
- Backup ใน localStorage เป็นเพียง fallback; ระบบเก็บรายการที่ซิงก์แล้วล่าสุด 12 เกมเพื่อไม่ให้พื้นที่ browser โตไม่จำกัด แต่ข้อมูลหลักของเกมที่มี Game ID ยังคงอยู่ใน Neon
- Local staging ที่ใช้ Neon Data API ต้องใช้ origin ที่อนุญาตใน Neon CORS; ปัจจุบัน `http://localhost:3000` ใช้ได้ ส่วน port อื่น เช่น 3100 ต้องเพิ่ม origin ก่อนจึงจะทดสอบการโหลด DB ได้

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
- deploy ไปที่ GitHub Pages ผ่าน `origin` ที่เดียว อย่าเพิ่ม host ที่สอง dynamic route หรือ
  edge function กลับเข้ามาโดยไม่ได้ตกลงกันก่อน; OG image ต้องเป็นไฟล์ static ใน `public/`
- ตรวจ deep-link routing หลังแตะ base path, history หรือ 404 script
- แยกผล simulated/browser QA ออกจาก real-device touch และ native share-sheet testing เสมอ
- Worktree อาจมีงานของคนอื่นอยู่ ห้าม reset/revert การเปลี่ยนที่ไม่เกี่ยวข้อง
