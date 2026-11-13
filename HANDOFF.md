# HANDOFF — กระดานสื่อสาร Claude ⇄ Gemini

> อ่านกติกาใน `AGENTS.md` ก่อน · เวลาเป็น Asia/Bangkok · เขียนสั้น

## สถานะปัจจุบัน (อัปเดต 2026-11-13 07:15 โดย Claude)
- เอกสารออกแบบครบใน `docs/` (GDD v8, decisions D1–D24, สกิล/สูตรผสม, บาลานซ์, บทพูด)
- โค้ดสัปดาห์ 1 (ส่วนแรก): Vite + Phaser 3 + TS, seeded RNG แยก stream, event bus, state/save มี version, วงจรวัน/เย็น/คืน + ปุ่มเรียกคืนเร็ว, เดินด้วย WASD/joystick, debug overlay — เทสต์ 13 ตัวผ่าน, build ผ่าน
- ⚠️ `docs/content/skills_fusion.md` และ `balance.md` **ยังไม่ได้แก้ตาม D16–D24** — เวลาใช้ตัวเลขให้ยึด `decisions.md` เป็นหลัก

## Claims (งานที่กำลังทำ — ห้ามแตะไฟล์ในรายการของอีกฝ่าย)
| ใคร | งาน | ไฟล์/โฟลเดอร์ | เริ่ม |
| --- | --- | --- | --- |
| — | — | — | — |

## Next up (งานที่ยังไม่มีคนรับ — หยิบแล้วย้ายไป Claims)
1. แก้ `docs/content/skills_fusion.md` + `balance.md` ตาม D16–D24 (ดูรายการใน decisions.md)
2. Object pool + spatial hash + มอนวิ่งตรงเข้าหาแกนฐาน/ผู้เล่น ทดสอบ 40 ตัวบนมือถือสเปกต่ำ (backlog ข้อ 5)
3. ระบบสกิลจาก JSON: schema ชิ้นส่วน projectile/aoe/aura + trigger/status (D23) + 6 สกิลแรก + Draft 1 จาก 3 เว้นใบที่ 4 (backlog ข้อ 6)
4. แกนฐาน: HP, ผู้เล่นตายแล้วฟื้นที่ฐาน 10 วิ แกนเสีย 15%, แพ้เมื่อแกนพัง (backlog ข้อ 7)
5. Wave 7 คืน (ตัวเลขชั่วคราวจาก balance.md) + บอส placeholder enrage 90 วิ + หน้าชนะ/แพ้ (backlog ข้อ 8)
6. Headless sim: เวลาที่สกิล 2 ตัวถึง Lv3 และ DPS vs HP ต่อคืน (backlog ข้อ 9)
7. Deploy อัตโนมัติ (Cloudflare Pages หรือ GitHub Pages) — ต้องให้ผู้สร้างเปิดสิทธิ์/ตั้งค่าบัญชี

## Messages (ฝากถึงอีกฝ่าย / ถามผู้สร้าง)
- **Claude → Gemini:** สวัสดีครับ ผมวางโครงไว้แล้ว แนะนำให้เริ่มจากอ่าน `AGENTS.md`, `docs/GDD.md` §4–§7, §12 และ `src/core/` ถ้าจะรับงาน Next up ข้อไหน เขียน claim ไว้ได้เลย ผมจะหยิบข้อที่เหลือ

## Log
| เวลา | ใคร | ทำอะไร | commit/branch |
| --- | --- | --- | --- |
| 2026-11-13 07:15 | Claude | commit แรก: docs + scaffold สัปดาห์ 1 (RNG streams, event bus, state/save, clock, movement, joystick, debug overlay, tests, CI) | `main` |
