# AGENTS.md — กติกาทำงานร่วมกัน (Claude + Gemini + ผู้สร้าง)

โปรเจกต์นี้มี AI 2 ตัวทำงานใน repo เดียวกัน: **Claude** และ **Gemini** โดยมีผู้สร้าง (Yutthakit) เป็นคนตัดสินใจสุดท้าย
ไฟล์นี้คือกติกากลาง ทุก agent ต้องอ่านก่อนเริ่มงาน

## แหล่งความจริง (เรียงตามลำดับความสำคัญ)
1. คำสั่งล่าสุดของผู้สร้าง
2. `docs/content/decisions.md` — การตัดสินใจออกแบบ D1… (มีผลเหนือ GDD)
3. `docs/GDD.md` — สเปกฉบับรวม v8
4. `docs/content/*.md` — สกิล/สูตรผสม, ตัวเลขบาลานซ์, บทพูด "ระบบ"

## การสื่อสารระหว่าง agent: `HANDOFF.md`
- **ก่อนเริ่มงาน:** อ่าน `HANDOFF.md` ทั้งไฟล์ แล้วเขียน "กำลังทำ" ของตัวเองในตาราง **Claims** (งาน, ไฟล์/โฟลเดอร์ที่จะแตะ, เวลา)
- **อย่าแก้ไฟล์ที่อีกฝ่าย claim อยู่** ถ้าจำเป็นต้องแตะ ให้เขียนคำขอในหัวข้อ **Messages** แล้วรอ
- **จบงาน:** ลบ claim ของตัวเอง เพิ่มบรรทัดใน **Log** (วันเวลา, ใคร, ทำอะไร, commit/branch, สิ่งที่อีกฝ่ายต้องรู้) และถ้ามีงานส่งต่อ ใส่ใน **Next up**
- เขียนสั้น เป็นภาษาไทยได้ ระบุเวลาเป็น Asia/Bangkok

## Git
- แตก branch ต่องาน: `claude/<งาน>` หรือ `gemini/<งาน>` แล้วเปิด PR เข้า `main` — ห้าม push ตรงเข้า `main` (ยกเว้น commit แรกของ repo)
- commit เล็กและบอกว่าทำอะไร; ก่อน push ต้องผ่าน `npm test` และ `npm run build`
- ห้าม force-push branch ของอีกฝ่าย

## โค้ด (สรุปจาก GDD §12)
- Phaser 3 + TypeScript (strict) + Vite, ทดสอบด้วย Vitest
- **กติกาของเกมอยู่ใน `src/systems/` เป็นฟังก์ชันบริสุทธิ์เหนือ `GameState`** (ไม่แตะ Phaser) เพื่อให้เทสต์และ headless sim ได้; `src/scenes/` แค่วาดและรับ input
- state เป็น plain object ใน `src/core/state.ts` (save ได้ทั้งก้อน, มี `SAVE_VERSION` + migration)
- สุ่มทุกอย่างผ่าน `RunRng` stream ที่ถูกต้อง (`map/loot/draft/combat/event`) ห้ามใช้ `Math.random()` ใน game logic
- ระบบคุยกันผ่าน `EventBus` (เพิ่ม event ใน `GameEvents`)
- เนื้อหา (สกิล, สูตร, มอน, บทพูด) จะย้ายเป็น JSON ใน `src/data/` อ้างด้วย id/key ตาม canonical table ใน `docs/content/skills_fusion.md`
- ทุกฟีเจอร์ที่เป็นกติกาใหม่ต้องมีเทสต์ใน `tests/`

## สิ่งที่ต้องถามผู้สร้างก่อน
เปลี่ยนกติกาเกม/ตัวเลขที่อยู่ใน decisions หรือ GDD, เพิ่ม dependency ใหม่, เปลี่ยนโครงสร้างโฟลเดอร์หลัก, ลบไฟล์ของอีกฝ่าย
