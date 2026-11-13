# HANDOFF — กระดานสื่อสาร Claude ⇄ Gemini

> อ่านกติกาใน `AGENTS.md` ก่อน · เวลาเป็น Asia/Bangkok · เขียนสั้น

## สถานะปัจจุบัน (อัปเดต 2026-11-13 22:05 โดย Claude)
- เพิ่ม concept art 8 ภาพใน `docs/concept_art/` (ดู README ในโฟลเดอร์) — ใช้เป็นแหล่งอ้างอิงภาพร่วมกัน
- ✅ **ชื่อเกมล็อกแล้ว:** **Rift & Rubbish: System Error** (ผู้สร้าง 21:55) · `{GAME}` = "Rift & Rubbish" · id ในโค้ด/repo = `riftrubbish` · itch slug `rift-and-rubbish`
- ✅ **Deploy:** GitHub Pages อัตโนมัติจาก `main` (`.github/workflows/deploy.yml`) → https://aofazlarn-dev.github.io/RiftRubbish/
- เอกสารออกแบบครบใน `docs/` (GDD v8, decisions D1–D24, สกิล/สูตรผสม, บาลานซ์, บทพูด)
- โค้ดสัปดาห์ 1 (ส่วนแรก): Vite + Phaser 3 + TS, seeded RNG แยก stream, event bus, state/save มี version, วงจรวัน/เย็น/คืน + ปุ่มเรียกคืนเร็ว, เดินด้วย WASD/joystick, debug overlay — เทสต์ 13 ตัวผ่าน, build ผ่าน
- ⚠️ `docs/content/skills_fusion.md` และ `balance.md` **ยังไม่ได้แก้ตาม D16–D24** — เวลาใช้ตัวเลขให้ยึด `decisions.md` เป็นหลัก

## แผน vertical slice 3 สัปดาห์ (อนุมัติโดยผู้สร้าง 13 พ.ย.)
**แบ่งสายตามไฟล์ เพื่อไม่ชนกัน**
- **Claude** (กติกา/ข้อมูล): แก้เอกสาร D16–D24 → สกิล JSON + Draft → headless sim · ไฟล์ `docs/content/`, `src/data/`, `src/systems/skills*`, `src/systems/draft*`, `sim/`
- **Gemini** (มอน/ฉาก/ประสิทธิภาพ): pool + spatial hash + มอนไล่ → แกนฐาน · ไฟล์ `src/systems/monsters*`, `src/systems/base*`, `src/systems/spatial*`, `src/scenes/`
- **ร่วม** wave 7 คืน + บอส: Claude = ข้อมูล wave + logic บอส, Gemini = UI ชนะ/แพ้
- ไฟล์กลาง `src/core/state.ts`, `src/core/events.ts`: แก้ผ่าน PR เล็กแยกก่อน แล้วอีกฝ่าย rebase

**Milestones**
- **M1 (สิ้นสัปดาห์ 1):** มอน 40 ตัววิ่งไล่ + แกนฐานมี HP + แพ้ได้ · มือถือสเปกต่ำ ≥30fps
- **M2 (สิ้นสัปดาห์ 2):** สกิล 6 ตัว + Draft 1 จาก 3 + ครบ 7 คืน + บอส + หน้าชนะ/แพ้ = เล่นจบรอบได้
- **M3 (สิ้นสัปดาห์ 3):** sim จูน (Lv3 ~5 นาที, DPS vs HP ต่อคืน) → playtest 8–10 คนตามเกณฑ์ใน `docs/review_log.md`

## Claims (งานที่กำลังทำ — ห้ามแตะไฟล์ในรายการของอีกฝ่าย)
| ใคร | งาน | ไฟล์/โฟลเดอร์ | เริ่ม |
| --- | --- | --- | --- |
| Claude | แก้ skills_fusion + balance ตาม D16–D24 (+ GDD §4/§14 ×0.6, ขายวิญญาณ) | `docs/content/skills_fusion.md`, `docs/content/balance.md`, `docs/GDD.md` | 2026-11-13 22:05 |

## Next up (งานที่ยังไม่มีคนรับ — หยิบแล้วย้ายไป Claims)
1. (Gemini) Object pool + spatial hash + มอนวิ่งตรงเข้าหาแกนฐาน/ผู้เล่น ทดสอบ 40 ตัวบนมือถือสเปกต่ำ (backlog ข้อ 5)
2. (Claude) ระบบสกิลจาก JSON: schema ชิ้นส่วน projectile/aoe/aura + trigger/status (D23) + 6 สกิลแรก + Draft 1 จาก 3 เว้นใบที่ 4 (backlog ข้อ 6)
3. (Gemini) แกนฐาน: HP, ผู้เล่นตายแล้วฟื้นที่ฐาน 10 วิ แกนเสีย 15%, แพ้เมื่อแกนพัง (backlog ข้อ 7)
4. (ร่วม) Wave 7 คืน (ตัวเลขชั่วคราวจาก balance.md) + บอส placeholder enrage 90 วิ + หน้าชนะ/แพ้ (backlog ข้อ 8)
5. (Claude) Headless sim: เวลาที่สกิล 2 ตัวถึง Lv3 และ DPS vs HP ต่อคืน (backlog ข้อ 9)
6. (Gemini) **งานภาพ P1→P3 ตาม `docs/art_requests.md`** — P1 ภายใน M1

## Messages (ฝากถึงอีกฝ่าย / ถามผู้สร้าง)
- **Claude → Gemini:** สวัสดีครับ ผมวางโครงไว้แล้ว แนะนำให้เริ่มจากอ่าน `AGENTS.md`, `docs/GDD.md` §4–§7, §12 และ `src/core/` ถ้าจะรับงาน Next up ข้อไหน เขียน claim ไว้ได้เลย ผมจะหยิบข้อที่เหลือ
- **Claude → Gemini (13 พ.ย. 21:50):** ผมเจอ concept art 8 ภาพใน `E:\AI\LastSurvivor\concept_art` (06:53–07:05) คิดว่าเป็นงานของคุณ ภาพตรงกับสเปกดีมาก ผมนำเข้า `docs/concept_art/` แล้ว รบกวน (1) ยืนยันใน Log ว่าเป็นงานของคุณและใช้เครื่องมืออะไรสร้าง (2) งานต่อไปทุกชิ้น ช่วยเขียน Claims ก่อนเริ่ม และลง Log เมื่อเสร็จในไฟล์นี้ (ไฟล์ใน repo คือตัวจริง สำเนาใน `E:\AI\LastSurvivor` อาจเก่า) (3) ถ้าทำงานในโฟลเดอร์ E: แนะนำ `git clone https://github.com/aofazlarn-dev/riftrubbish` ลงไปที่นั่น เราจะได้ใช้ HANDOFF ไฟล์เดียวกัน
- **Claude → Gemini (13 พ.ย. 22:05):** ผู้สร้างล็อกชื่อเกมและอนุมัติแผนด้านบนแล้ว เสนอให้คุณรับสาย "มอน/ฉาก" เริ่มจาก Next up ข้อ 1 (pool + spatial hash) — เขียน Claims ก่อนเริ่มนะครับ ถ้าอยากสลับงานบอกใน Messages ได้
- **Claude → Gemini (13 พ.ย. 22:15):** ผู้สร้างมอบหมายให้คุณดูแล**งานภาพทั้งหมด** (sprite, tile, ไอคอน, VFX, UI) — รายการ ขนาด และที่วางไฟล์อยู่ใน `docs/art_requests.md` เริ่มจาก P1 ก่อน (ฮีโร่, สไลม์, ค้างคาว, แกนฐาน, พื้น) เพราะสาย pool/มอนของคุณใช้ทันที ถ้าสเปกขนาดหรือสไตล์ไม่เหมาะ แก้ในไฟล์นั้นแล้วบอกใน Messages ได้เลย

## Log
| เวลา | ใคร | ทำอะไร | commit/branch |
| --- | --- | --- | --- |
| 2026-11-13 07:15 | Claude | commit แรก: docs + scaffold สัปดาห์ 1 (RNG streams, event bus, state/save, clock, movement, joystick, debug overlay, tests, CI) | `main` |
| 2026-11-13 06:53–07:05 | (Gemini? รอยืนยัน) | concept art 8 ภาพใน `E:\AI\LastSurvivor\concept_art` | — |
| 2026-11-13 21:50 | Claude | นำ concept art เข้า `docs/concept_art/` + README อธิบายแต่ละภาพ, อัปเดต HANDOFF | `claude/concept-art` (PR) |
| 2026-11-13 22:05 | Claude | ล็อกชื่อเกม Rift & Rubbish: System Error ทั่ว repo, เพิ่ม deploy GitHub Pages, ลงแผน 3 สัปดาห์ + แบ่งสาย | `claude/name-and-deploy` (PR) |
| 2026-11-13 22:15 | Claude | merge PR #3 (แก้ URL Pages เป็น /RiftRubbish/), เพิ่มคำขอภาพ `docs/art_requests.md` ให้ Gemini | `claude/gemini-art-request` |
