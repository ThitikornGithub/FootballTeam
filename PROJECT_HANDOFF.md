# FootballTeam — Project Handoff

อัปเดตล่าสุด: 6 กันยายน 2026  
ขอบเขตการตรวจ: source code, scheduling engine, Neon persistence, GitHub Pages deployment, dependency audit และข้อมูลที่อยู่ใน Neon ณ วันที่ตรวจ  
สถานะโค้ดที่ใช้ตรวจ: `33ce7bc` (`Smooth tactics board touch controls`)

## 1. ภาพรวมโปรเจกต์

FootballTeam เป็น mobile-first web app สำหรับกลุ่มเพื่อนที่เล่นฟุตบอลสนามเดียว ผู้ใช้ทุกคนที่เข้าถึงเว็บสามารถสร้าง เปิด แก้ไข แชร์ และลบเกมได้โดยไม่มีหน้า login

ความสามารถหลัก:

- สร้างตารางแบบ round robin และวนรอบต่อจนเต็มช่วงเวลาที่กำหนด
- ค่าเริ่มต้น 4 ทีม เวลา 19:00–22:00 แข่ง 10 นาที พัก 2 นาที
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

| Path | Responsibility |
| --- | --- |
| `components/football/football-app.tsx` | หน้าหลักทั้งหมด, navigation, setup, teams, schedule, score, settings, share, game list และ sync lifecycle |
| `components/football/tactics-board.tsx` | กระดาน tactic และ pointer/touch interaction |
| `components/football/shared.tsx` | header, bottom navigation, team colors และ shared controls |
| `lib/football-engine.ts` | scheduling, match status, score, standings, overtime และ GK assignment |
| `lib/football-types.ts` | domain types ทั้งหมด |
| `lib/football-data-api.ts` | Neon Data API endpoint, public credential และ RPC client |
| `lib/standings-share-card.ts` | วาดและ export PNG ตารางคะแนน |
| `lib/demo-data.ts` | ข้อมูลตัวอย่าง 4 ทีม |
| `db/neon-schema.sql` | table, RPC functions และ grants ของ Neon |
| `scripts/verify-engine.ts` | engine smoke checks |
| `scripts/github-pages-404.html` | redirect deep path ของ GitHub Pages กลับเข้า SPA |
| `.github/workflows/deploy-pages.yml` | build และ deploy ทุกครั้งที่ push `main` |
| `next.config.ts` | static export และ `/FootballTeam` asset prefix |

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
- `save_football_game`
- `list_football_games`
- `delete_football_game`

พฤติกรรมปัจจุบัน:

1. เมื่อเปิด deep link แอปโหลด state จาก Neon
2. เมื่อแก้ state แอปเขียน local backup ทันที และ debounce การบันทึก Neon 450 ms
3. เมื่อ page ถูกซ่อนหรือปิด มี keepalive flush เพื่อพยายามส่ง state ล่าสุด
4. ทุก 4 วินาที แอป poll Neon เพื่อรับการแก้ไขจากอุปกรณ์อื่น
5. สถานะบนหน้า Home คือ `กำลังบันทึก`, `บันทึกแล้ว`, `ซิงก์ไม่สำเร็จ` หรือ `เฉพาะเครื่อง`

ข้อสำคัญ: `revision` ใน DB ถูกเพิ่มทุกครั้งที่ save แต่ client ยังไม่ได้ใช้ revision ทำ optimistic concurrency control จึงยังเป็น last-write-wins

## 6. URL และ routing

- Root `/FootballTeam/` เปิดหน้าเริ่มต้น 3 ปุ่มเสมอ
- Game URL ใช้ `/FootballTeam/gameYYYYMMDD-N`
- GitHub Pages ไม่มี SPA rewrite จริง จึงใช้ `404.html` เก็บ path ใน `sessionStorage`, redirect ไป root แล้ว React คืน path ก่อนอ่าน Game ID
- Browser back/forward ยังไม่ได้ synchronize กับ app state ผ่าน `popstate`; navigation หลักควรใช้ปุ่มในแอป

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

ยังไม่มี automated browser/E2E tests และรอบ audit นี้ไม่ได้แทนการทดสอบ touch/share sheet บนอุปกรณ์จริง

## 10. Open findings และ known risks

### P1 — Data integrity

#### 1. Multi-device edits สามารถเขียนทับกันได้

`save_football_game` เพิ่ม revision แต่ไม่รับ expected revision และ client ไม่ส่ง revision กลับไปตรวจ สองเครื่องที่แก้พร้อมกันจึงเป็น last-write-wins การเปลี่ยน score จากเครื่องหนึ่งอาจถูก state เก่าจากอีกเครื่องเขียนทับทั้งก้อน

แนวทางแก้: เพิ่ม `p_expected_revision`, update ด้วย `where revision = p_expected_revision`, คืน conflict เมื่อ revision ไม่ตรง แล้วทำ conflict/reload UI หรือ merge เฉพาะ field ที่เปลี่ยน

#### 2. Reconnect/poll อาจทับ local change ที่ยังส่งไม่สำเร็จ

เมื่อ autosave fail แอปเก็บ local backup ไว้ แต่ poll ที่กลับมาสำเร็จภายหลังสามารถนำ remote state เก่ามาแทน local state ก่อนมี retry ที่แน่นอน

แนวทางแก้: มี explicit dirty state และ save queue; ห้าม poll apply remote ขณะ dirty/in-flight; retry ด้วย backoff; ใช้ revision conflict control ร่วมกัน

#### 3. เกมที่สร้างไม่สำเร็จบน Neon กู้กลับหลัง reload ไม่ได้จาก UI

เมื่อ create RPC fail แอปแสดงเกมเป็น `เฉพาะเครื่อง` และเขียน backup แต่ root route ตั้งใจไม่ restore local tournament ปัจจุบันยังไม่มีปุ่ม retry publish หลังการ์ดข้อมูลการแข่งขันถูกเอาออกจาก Settings ดังนั้น refresh/ปิดหน้าอาจทำให้เกม local-only หายจากหน้าจอ แม้ bytes อาจยังอยู่ใน localStorage

แนวทางแก้: เพิ่ม recovery banner ที่ root หรือบันทึก draft list แยก พร้อมปุ่ม “ลองบันทึกขึ้นฐานข้อมูลอีกครั้ง”

### P2 — Functional correctness

#### 4. กดเริ่มแมตช์อนาคตทำให้แมตช์ปัจจุบันจบโดยไม่มีสกอร์

`setMatchStatus(..., 'current')` เปลี่ยน current match เดิมที่อยู่ก่อน target เป็น `finished` แม้ไม่มี score ขณะที่ match ระหว่างกลางยังเป็น `upcoming` ตรวจซ้ำด้วย engine edge-case แล้วเกิดจริง

แนวทางแก้: ก่อนเริ่ม match อื่นให้ถามว่าจะพัก/ย้าย current เดิมกลับเป็น upcoming หรือบันทึกผลก่อน ห้ามสร้าง finished match ที่ score ไม่ครบโดยไม่ยืนยัน

#### 5. กระดาน tactic ไม่ reconcile เมื่อ roster เปลี่ยน

ถ้าสร้าง tactic แล้วเพิ่มหรือลบผู้เล่น `storedBoard` ยังถือว่า valid ตราบใดที่สองทีมยังอยู่ ผู้เล่นใหม่จึงไม่เพิ่มเป็น marker และผู้เล่นที่ลบอาจยังเหลือ marker พร้อม label เก่า จนกด reset หรือเปลี่ยนทีม

แนวทางแก้: reconcile markers ด้วย current player IDs ทุกครั้งที่อ่าน board โดยรักษาพิกัดของ marker ที่ยังอยู่

#### 6. ไม่มี runtime schema validation สำหรับ state จาก DB/local backup

client cast JSON เป็น `Tournament` โดยตรง และ RPC ตรวจเพียงว่า state เป็น JSON object ผู้ที่ถือ public credential สามารถส่ง object รูปแบบผิด ทำให้หน้าจอ throw ตอนอ่าน `teams`, `matches` หรือวันที่

แนวทางแก้: เพิ่ม versioned schema validation ที่ client และ validation ใน RPC ก่อน save; reject state ใหญ่หรือ field ที่ผิดประเภท

### P2 — Dependency/security maintenance

`npm audit` วันที่ตรวจรายงาน 11 packages ใน dependency tree: 8 high, 2 moderate, 1 low; เมื่อใช้ `--omit=dev` ยังรายงาน 5 high และ 1 low ตามการจัดประเภท package ของ npm

รายการ direct upgrade ที่ audit เสนอมี `react-server-dom-webpack 19.2.8`, `vinext 1.0.0-beta.9`, `vite 8.2.2` และ `@cloudflare/vite-plugin 1.54.4` พร้อม transitive fixes ผ่าน Wrangler/Miniflare

เว็บ production เป็น static GitHub Pages และไม่ได้เปิด Vinext server functions จึงลด exploit surface ของ server-side advisories หลายรายการ แต่ไม่ควรปล่อยค้าง ควร upgrade เป็นชุดใน branch แยกและรัน full regression/build ก่อน merge โดยรักษา React package versions ให้เข้าชุดกัน

### P3 — UX/maintenance

#### 7. Browser back/forward ไม่เปลี่ยน app view/state

โค้ดใช้ `history.pushState/replaceState` แต่ไม่มี `popstate` listener ผู้ใช้กด browser Back อาจเห็น URL เปลี่ยนแต่ UI ยังเป็นเกมเดิม

#### 8. ลดจำนวนทีมระหว่าง setup อาจทำให้คู่แรกที่แสดงกับคู่ที่ submit ไม่ตรงกัน

UI clamp select index ด้วย `Math.min` แต่ state index เดิมไม่ถูก normalize ทันที เมื่อเลือกจำนวนทีมน้อยลงบางลำดับ คู่แรกที่ส่งเข้า engine อาจ fallback หรือถูกมองข้าม

#### 9. Score input จำกัดการพิมพ์ 2 หลัก แต่ปุ่ม `+` เพิ่มเกิน 99 ได้

เป็น inconsistency เล็กน้อย ควรกำหนดเพดานเดียวกันหรือยอมรับ score ไม่จำกัดทั้งสองทาง

#### 10. Copy ใน Settings ไม่ตรงกับความสามารถจริง

ข้อความระบุว่า “จำนวนทีมและรายชื่อผู้เล่นแก้ได้จากหน้าทีม” แต่หน้าทีมปัจจุบันแก้ได้เฉพาะ roster/attendance/GK order ไม่ได้แก้จำนวนทีม ชื่อทีม หรือสีเสื้อ

#### 11. Test command ยังไม่ถูกประกาศใน package scripts

มี `scripts/verify-engine.ts` แต่ไม่มี `npm test` และยังไม่มี UI/sync/database contract tests ทำให้ regression สำคัญต้องอาศัย manual audit

## 11. Recommended next work order

1. แก้ P1 ทั้งสามข้อเป็นชุดเดียว: revision CAS, serialized save queue, dirty/offline retry และ local draft recovery
2. เพิ่ม runtime Tournament schema + DB contract validation และ state size limit
3. แก้ match transition ไม่ให้ finished โดยไม่มี score
4. ทำ tactics roster reconciliation
5. เพิ่ม automated tests สำหรับ sync conflict, reconnect, match state machine, setup team-count change และ tactics roster changes
6. upgrade dependencies ใน branch แยก แล้วรัน lint/typecheck/engine/build/E2E
7. เพิ่ม `npm test` ให้เรียก engine checks และต่อยอดเป็น UI/sync contract tests

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
