# Football Match Maker

Mobile-first MVP สำหรับจัดตารางฟุตบอลแบบ Round Robin บน 1 สนาม และหมุนเวียนผู้รักษาประตูแยกตามแต่ละทีม

## Run locally

ต้องใช้ Node.js 22.13 ขึ้นไป

```bash
npm install
npm run dev
```

เปิด `http://localhost:3000`

## Check before release

```bash
npm run lint
npx tsc --noEmit
npm run build
```

## V1 features

- สร้างตารางพบกันหมดด้วย circle-method และกระจายช่วงพักเมื่อใช้สนามเดียว
- ตรวจเวลาที่ต้องใช้และเวลาจบก่อนสร้างตาราง
- จัดการทีม ผู้เล่น ลำดับ และสถานะขาดวันนี้
- สุ่ม GK แยกทีม พร้อมรอบใหม่และการข้ามคิว
- เริ่ม/จบแมตช์ ดูคิวและประวัติ GK
- แชร์ผ่าน Web Share API หรือคัดลอกข้อความ
- บันทึกข้อมูลใน LocalStorage

ไม่มี backend, authentication, LINE Login/LIFF หรือ score tracking ใน V1 โครงสร้างข้อมูลแยกจาก UI เพื่อรองรับการเชื่อมต่อเหล่านี้ภายหลัง
