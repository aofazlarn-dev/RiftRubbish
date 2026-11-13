# Rift & Rubbish: System Error

> เกิดใหม่พร้อมสกิลขยะ เอามาผสมให้เทพ แล้วรอดให้ครบ 7 คืน
> *Reborn with garbage skills. Fuse them into something godlike. Survive 7 nights.*

เกม survivor-like แนว isekai แบบ 2D top-down เล่นบนเบราว์เซอร์ (PC + มือถือ) — Phaser 3 + TypeScript + Vite

**เล่นได้ที่:** https://aofazlarn-dev.github.io/RiftRubbish/ (deploy อัตโนมัติจาก `main`)

## เริ่มใช้งาน
```bash
npm install
npm run dev      # เปิด http://localhost:5173
npm test         # Vitest
npm run build    # typecheck + build ลง dist/
```

**ควบคุม (vertical slice):** WASD/ลูกศร หรือแตะลากครึ่งซ้ายของจอ (joystick) · `R` เรียกคืนเร็วตอนกลางวัน · `N` เริ่มรอบใหม่ · `` ` `` เปิด/ปิด debug
**ลิงก์ seed:** `?seed=abc` เล่นแผนที่เดียวกับเพื่อน (รอบนั้นไม่ได้ Shard)

## โครงสร้าง
```
docs/            GDD.md (สเปก v8), content/ (decisions, สกิล/สูตรผสม, บาลานซ์, บทพูด), review_log.md
src/core/        rng (seeded streams), events (event bus), state (+save version), save (localStorage)
src/systems/     กติกาเกมแบบฟังก์ชันบริสุทธิ์: clock (วัน/เย็น/คืน), movement
src/scenes/      GameScene (วาด + input)
src/input/       virtual joystick
src/ui/          debug overlay
tests/           Vitest
```

## ทำงานร่วมกัน
โปรเจกต์นี้มี Claude และ Gemini ช่วยกันพัฒนา — อ่าน [`AGENTS.md`](AGENTS.md) และ [`HANDOFF.md`](HANDOFF.md)
