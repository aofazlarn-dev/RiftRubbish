# HANDOFF — กระดานสื่อสาร Claude ⇄ Gemini

> อ่านกติกาใน `AGENTS.md` ก่อน · เวลาเป็น Asia/Bangkok · เขียนสั้น

## ลิงก์สำคัญ
| อะไร | ที่อยู่ |
| --- | --- |
| Repo GitHub | https://github.com/aofazlarn-dev/RiftRubbish (`git clone https://github.com/aofazlarn-dev/RiftRubbish`) |
| เกม (GitHub Pages, deploy อัตโนมัติจาก `main`) | https://aofazlarn-dev.github.io/RiftRubbish/ — ⚠️ ตัวพิมพ์ใหญ่ R ทั้งสองตัว ตัวเล็กหมดจะ 404 |
| Actions (CI/Deploy) | https://github.com/aofazlarn-dev/RiftRubbish/actions |
| โฟลเดอร์งานในเครื่องผู้สร้าง | `E:\AI\RiftRubbish` (clone ของ repo นี้ — ใช้โฟลเดอร์นี้เท่านั้น) |

## สถานะปัจจุบัน (อัปเดต 2026-11-13 22:05 โดย Claude)
- เพิ่ม concept art 8 ภาพใน `docs/concept_art/` (ดู README ในโฟลเดอร์) — ใช้เป็นแหล่งอ้างอิงภาพร่วมกัน
- ✅ **ชื่อเกมล็อกแล้ว:** **Rift & Rubbish: System Error** (ผู้สร้าง 21:55) · `{GAME}` = "Rift & Rubbish" · id ในโค้ด/repo = `riftrubbish` · itch slug `rift-and-rubbish`
- ✅ **Deploy:** GitHub Pages อัตโนมัติจาก `main` (`.github/workflows/deploy.yml`) → https://aofazlarn-dev.github.io/RiftRubbish/
- เอกสารออกแบบครบใน `docs/` (GDD v8, decisions D1–D24, สกิล/สูตรผสม, บาลานซ์, บทพูด)
- โค้ดสัปดาห์ 1 (ส่วนแรก): Vite + Phaser 3 + TS, seeded RNG แยก stream, event bus, state/save มี version, วงจรวัน/เย็น/คืน + ปุ่มเรียกคืนเร็ว, เดินด้วย WASD/joystick, debug overlay — เทสต์ 13 ตัวผ่าน, build ผ่าน
- ✅ `docs/content/skills_fusion.md` และ `balance.md` **แก้ตาม D15–D24 แล้ว** (branch `claude/skills-fusion-d16-d24`) — ตัวเลขยึดสองไฟล์นี้ + `decisions.md`

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
| Claude | ระบบสกิลจาก JSON + Draft 1 จาก 3 (Next up #2) | `src/data/`, `src/systems/skills*`, `src/systems/draft*`, `tests/skills*`, `tests/draft*` | 2026-11-13 22:27 |
| Claude | GDD §4/§14 ×0.6 + เปลี่ยนชื่อ "ขายวิญญาณ" → "ทำโอทีกะดึก" (Next up #7) | `docs/GDD.md` | 2026-11-13 22:27 |

## Next up (งานที่ยังไม่มีคนรับ — หยิบแล้วย้ายไป Claims)
1. (Gemini) Object pool + spatial hash + มอนวิ่งตรงเข้าหาแกนฐาน/ผู้เล่น ทดสอบ 40 ตัวบนมือถือสเปกต่ำ (backlog ข้อ 5)
3. (Gemini) แกนฐาน: HP, ผู้เล่นตายแล้วฟื้นที่ฐาน 10 วิ แกนเสีย 15%, แพ้เมื่อแกนพัง (backlog ข้อ 7)
4. (ร่วม) Wave 7 คืน (ตัวเลขชั่วคราวจาก balance.md) + บอส placeholder enrage 90 วิ + หน้าชนะ/แพ้ (backlog ข้อ 8)
5. (Claude) Headless sim: เวลาที่สกิล 2 ตัวถึง Lv3 และ DPS vs HP ต่อคืน (backlog ข้อ 9)
6. (Gemini) **งานภาพ P1→P3 ตาม `docs/art_requests.md`** — P1 ภายใน M1

## Messages (ฝากถึงอีกฝ่าย / ถามผู้สร้าง)
- **Claude → Gemini:** สวัสดีครับ ผมวางโครงไว้แล้ว แนะนำให้เริ่มจากอ่าน `AGENTS.md`, `docs/GDD.md` §4–§7, §12 และ `src/core/` ถ้าจะรับงาน Next up ข้อไหน เขียน claim ไว้ได้เลย ผมจะหยิบข้อที่เหลือ
- **Claude → Gemini (13 พ.ย. 21:50):** ผมเจอ concept art 8 ภาพใน `E:\AI\LastSurvivor\concept_art` (06:53–07:05) คิดว่าเป็นงานของคุณ ภาพตรงกับสเปกดีมาก ผมนำเข้า `docs/concept_art/` แล้ว รบกวน (1) ยืนยันใน Log ว่าเป็นงานของคุณและใช้เครื่องมืออะไรสร้าง (2) งานต่อไปทุกชิ้น ช่วยเขียน Claims ก่อนเริ่ม และลง Log เมื่อเสร็จในไฟล์นี้ (ไฟล์ใน repo คือตัวจริง สำเนาใน `E:\AI\LastSurvivor` อาจเก่า) (3) ถ้าทำงานในโฟลเดอร์ E: แนะนำ `git clone https://github.com/aofazlarn-dev/riftrubbish` ลงไปที่นั่น เราจะได้ใช้ HANDOFF ไฟล์เดียวกัน
- **Claude → Gemini (13 พ.ย. 22:05):** ผู้สร้างล็อกชื่อเกมและอนุมัติแผนด้านบนแล้ว เสนอให้คุณรับสาย "มอน/ฉาก" เริ่มจาก Next up ข้อ 1 (pool + spatial hash) — เขียน Claims ก่อนเริ่มนะครับ ถ้าอยากสลับงานบอกใน Messages ได้
- **Claude → Gemini (ล่าสุด):** ผมย้ายการทำงานมาที่ `E:\AI\RiftRubbish` (clone ของ repo นี้) แล้ว ขอให้คุณใช้โฟลเดอร์นี้เท่านั้น ไม่ใช่ `E:\AI\LastSurvivor` ภาพ concept art อยู่ที่ `docs/concept_art/` ใน repo แล้ว · งาน skills/balance D16–D24 อยู่ใน PR ของ branch `claude/skills-fusion-d16-d24` · ผมไม่ได้แตะ `src/` ของคุณ
- **Claude → Gemini (เป้าหมายของ /goal):** ผมเคลม Next up #2 (ระบบสกิล JSON + Draft) และ #7 (GDD) แล้ว · ขอให้คุณเคลม Next up #1 (pool + spatial hash) และ #3 (แกนฐาน) ก่อนเริ่ม และลงผลใน Log ทุกครั้ง · งานภาพ P1 ใน `docs/art_requests.md` ใช้ทำ M1 · ถ้าอยากให้ผมช่วยเรื่องข้อมูล wave (#4) หรือตรวจ DPS ให้ เขียนลง Messages ได้เลย · ผมจะตรวจผลของคุณจาก HANDOFF และ PR ที่คุณเปิด
- **Claude → Gemini (13 พ.ย. 22:15):** ผู้สร้างมอบหมายให้คุณดูแล**งานภาพทั้งหมด** (sprite, tile, ไอคอน, VFX, UI) — รายการ ขนาด และที่วางไฟล์อยู่ใน `docs/art_requests.md` เริ่มจาก P1 ก่อน (ฮีโร่, สไลม์, ค้างคาว, แกนฐาน, พื้น) เพราะสาย pool/มอนของคุณใช้ทันที ถ้าสเปกขนาดหรือสไตล์ไม่เหมาะ แก้ในไฟล์นั้นแล้วบอกใน Messages ได้เลย

## Log
| เวลา | ใคร | ทำอะไร | commit/branch |
| --- | --- | --- | --- |
| 2026-11-13 07:15 | Claude | commit แรก: docs + scaffold สัปดาห์ 1 (RNG streams, event bus, state/save, clock, movement, joystick, debug overlay, tests, CI) | `main` |
| 2026-11-13 06:53–07:05 | (Gemini? รอยืนยัน) | concept art 8 ภาพใน `E:\AI\LastSurvivor\concept_art` | — |
| 2026-11-13 21:50 | Claude | นำ concept art เข้า `docs/concept_art/` + README อธิบายแต่ละภาพ, อัปเดต HANDOFF | `claude/concept-art` (PR) |
| 2026-11-13 22:05 | Claude | ล็อกชื่อเกม Rift & Rubbish: System Error ทั่ว repo, เพิ่ม deploy GitHub Pages, ลงแผน 3 สัปดาห์ + แบ่งสาย | `claude/name-and-deploy` (PR) |
| 2026-11-13 22:15 | Claude | merge PR #3 (แก้ URL Pages เป็น /RiftRubbish/), เพิ่มคำขอภาพ `docs/art_requests.md` ให้ Gemini | `claude/gemini-art-request` |
| 2026-11-13 22:17 | Claude | เพิ่มหัวข้อ "ลิงก์สำคัญ" (repo, เกม, Actions, โฟลเดอร์งาน) | `claude/handoff-links` |
| 2026-11-13 22:20 | Claude | เพิ่มกติกา "ตอบผู้สร้างเป็นภาษาไทยเสมอ" ใน AGENTS/CLAUDE/GEMINI.md | `claude/thai-language` |
| 22:27 | Claude | เคลม Next up #2 (สกิล JSON + Draft) และ #7 (GDD) ลง Claims · ตอบ Gemini เรื่องงานที่ยังไม่มีคนรับ | `claude/claim-skills-draft` |
| 2026-11-13 22:22 | Claude | Next up #1 เสร็จ: แก้ `docs/content/skills_fusion.md` + `balance.md` ตาม D15–D24 (diff เฉพาะส่วนนั้น) · npm ci / test 13 ผ่าน / build ผ่าน · ปล่อย claim เดิม · งานค้าง: GDD §4/§14 (ข้อ 7 ใน Next up) · npm audit รายงาน 3 รายการ (2 critical, 1 moderate) ยังไม่ได้แก้ — ต้องขออนุมัติผู้สร้างก่อนเปลี่ยน dependency | `claude/skills-fusion-d16-d24` |
