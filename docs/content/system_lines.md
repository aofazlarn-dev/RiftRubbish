# system_lines.md — บทพูดของ "ระบบ (The System)"

อ้างอิง: gdd_v8.md §3, §4, §5, §7, §8, §9 · **decisions.md D1–D24 มีผลเหนือทุกอย่าง**

**แนวทางการเขียน**
- บุคลิก: พูดกวนหน้าตาย สุภาพแบบประชดนิดๆ แซวด้วยมุกแนวนิยาย isekai ไม่หยาบคาย ไม่แซวเชื้อชาติ เพศ หรือรูปร่าง เล่นได้ทุกวัย
- มุก TH กับ EN **เขียนแยกกัน ไม่ได้แปลตรงตัว** (id เดียวกัน = จังหวะเกมเดียวกัน แต่มุกต่างกันได้)
- ตอนแพ้ / ยอมแพ้ / ล้ม: **แซวตัวระบบหรือมอน ไม่ซ้ำเติมผู้เล่น** (D24)
- ข้อความฝั่งผู้เล่นห้ามใช้ศัพท์ dev (Active/Passive/stack/aura) — ใช้ได้เฉพาะในบรรทัด "กลไก" / "เงื่อนไข" ที่เป็นโน้ตสำหรับทีม (D24)
- ความยาว: บรรทัดละไม่เกิน 70 ตัวอักษร นับแบบ **grapheme** (สระบน/ล่าง วรรณยุกต์ และ ำ ไม่นับแยก; อีโมจิ 1 ตัว = 1) หลังแทนค่าตัวแปรด้วยค่าที่ยาวที่สุดที่เป็นไปได้ (D23)
- ตัวแปร: `{n}` = คืนที่, `{k}` = ตัวเลขสถิติ, `{A}` `{B}` = สกิลต้นทาง, `{C}` = สกิลผลลัพธ์, `{skill}` = ชื่อสกิลใดๆ, `{skill:ID}` = ชื่อสกิลตาม id ในตาราง canonical ของ skills_fusion.md (ภาษาตามที่ผู้เล่นตั้ง) — **ห้ามพิมพ์ชื่อสกิลเองในบทพูด ให้อ้างผ่าน key** (D23)
- ชื่อ canonical ที่ใช้ในไฟล์นี้: J01 เตะฝุ่น / Kick Dust · J02 สะดุดล้ม / Trip Over · J03 ขว้างหิน / Throw Rock · J04 จุดไฟติดยาก / Reluctant Spark · R01a อุกกาบาตตกใส่ตัวเอง / Self-Inflicted Meteor · R01b ล้มหน้าคะมำแผ่นดินไหว / Faceplant Quake · R02a ทอร์นาโดเพลิง / Fire Tornado · R02b กองไฟเดินได้ / Walking Campfire
- คำแซวตอน {skill:J04} จุดไม่ติด: ขึ้นได้ไม่เกิน 1 ครั้งต่อ 30 วิ (D23)
- ข้อจำกัดของโหมด Daily Seed: ไม่มี "ของขวัญต้อนรับ" ไม่มี "ทำโอทีกะดึก" และไม่มีภารกิจรายวัน/Shard (เพราะ meta ปิด) ห้ามสุ่มบรรทัดพวกนี้ขึ้นในโหมด Daily
- รอบที่เปิดจากลิงก์ `?seed=` เล่นได้แต่ไม่ได้ Shard (D19) → ห้ามขึ้นบรรทัดที่พูดถึงรางวัล Shard (QUEST_*, LOSE_03, QUIT_02, WIN_03, EVE_OT) ให้ขึ้น SEED_01 แทน

---

## 1. ฉากตาย / ต้อนรับ (5)

| id | TH | EN |
|---|---|---|
| WELCOME_01 | ยินดีด้วย! คุณโดนรถบรรทุกชน ถูกต้องตามสูตรนิยายทุกประการ | Congratulations! A truck has chosen you. Extremely on-genre. |
| WELCOME_02 | ตรวจบุญเก่า... พอให้เกิดใหม่ได้ แต่ไม่พอให้ได้สกิลดี | Scanning soul... Quality: acceptable, if we squint. |
| WELCOME_03 | ยินดีต้อนรับสู่ต่างโลก ไม่มีไวไฟ แต่มีมอน ถือว่าแฟร์ | Welcome to another world. No Wi-Fi. Plenty of monsters. Fair trade. |
| WELCOME_04 | ภารกิจ: รอดให้ครบ 7 คืน ข่าวดี: ไม่ต้องไปทำงานวันจันทร์แล้ว | Objective: survive 7 nights. Upside: Mondays are cancelled. |
| WELCOME_05 | ระบบจะคอยช่วยเหลือคุณ (คำว่า "ช่วย" ในที่นี้ใช้แบบหลวมๆ) | The System is here to help. "Help" is used loosely. |

## 2. ได้สกิล

### 2.1 สกิลขยะ (8)

| id | TH | EN |
|---|---|---|
| TRASH_01 | ได้รับ [{skill:J02}] ความสามารถที่คุณฝึกมาทั้งชาติ | Acquired [{skill:J02}]. Finally, a skill you've practiced for years. |
| TRASH_02 | [{skill:J01}] ศัตรูแสบตา คุณก็แสบตา ยุติธรรมดี | [{skill:J01}]: blinds enemies. Also you. Mostly you. |
| TRASH_03 | [{skill:J03}] อาวุธยุคหิน สำหรับฮีโร่ยุคหิน | [{skill:J03}]: cutting-edge tech, circa 10,000 BC. |
| TRASH_04 | [{skill:J04}] ไฟแช็กมือสองยังรู้สึกเหนือกว่า | [{skill:J04}]: 3% fire, 97% smoke and regret. |
| TRASH_05 | ความหายาก: Common ระบบขอเรียกว่า "Common มากๆ" | Rarity: Common. Aggressively common. |
| TRASH_06 | ระบบไม่ได้ตั้งใจให้สกิลขยะนะ แค่ไม่ได้ตั้งใจให้สกิลดี | We didn't give you a bad skill on purpose. We just didn't try. |
| TRASH_07 | อย่าเพิ่งทิ้ง ขยะ 2 ชิ้นผสมกัน อาจได้ของเทพ... หรือขยะชิ้นใหญ่ | Don't toss it. Two trash skills might fuse into a legend. Or worse. |
| TRASH_08 | ได้สกิลขยะใบที่ 3 ติด! มอบฉายา "นักสะสมของเก่า" | Third trash skill in a row. Achievement unlocked: Hoarder. |

### 2.2 สกิลหายาก / Mythic (4)

ใน MVP สกิล Mythic ได้จากสูตรผสมเท่านั้น ไม่มีใน Draft (D3) — MYTHIC_* ขึ้นตอนผสมสูตร Mythic สำเร็จ

| id | TH | EN |
|---|---|---|
| RARE_01 | Legendary!? ขอระบบเช็กก่อน... อ้าว ไม่ใช่บั๊กจริงๆ แฮะ | Legendary?! Checking logs... Huh. Not a bug. |
| MYTHIC_01 | MYTHIC! โปรดทราบ: โชคนี้คุณยืมชาติหน้ามาใช้ | MYTHIC. This luck was borrowed from your next life. |
| MYTHIC_02 | [Mythic] ระบบไม่ได้ตื่นเต้นนะ เสียงมันสั่นเองเฉยๆ | [Mythic] The System is not excited. The System is just... vibrating. |
| MYTHIC_03 | สูตร Mythic สำเร็จ! ถอดถอนสถานะ "ตัวประกอบ" ของคุณแล้ว | Mythic recipe complete. Your "Background Character" status is revoked. |

## 3. Tutorial — ของขวัญต้อนรับ (4)

เฉพาะโหมด Casual ต้นคืนที่ 1 (§3)

| id | TH | EN |
|---|---|---|
| GIFT_01 | ของขวัญต้อนรับ! สกิลขยะเกรดพรีเมียม 2 ชิ้น ห่อด้วยความจริงใจ | Welcome gift! Two premium-grade trash skills. Gift-wrapped. |
| GIFT_02 | การ์ดใบเดียว ปุ่มเดียว กดผสมเลย ระบบไม่ได้ถามความเห็น | One card. One button. This is not a suggestion. |
| GIFT_03 | ได้ [{skill:R01a}]! แรงมาก เจ็บมาก ทั้งสองฝั่ง | [{skill:R01a}] acquired! Huge damage. Both directions. |
| GIFT_04 | ทดลองใช้ฟรีหมดแล้ว อยากได้ก็ผสมเองสิ | Your free trial has expired. Want it back? Craft it yourself. |

## 4. ภารกิจรายวัน (10)

เฉพาะโหมด Casual (Daily Seed ปิด meta, รอบจาก `?seed=` ไม่ได้ Shard) ขึ้นวันละ 3 ภารกิจ สุ่มจากชุดนี้ · รางวัลข้อละ **≤5 Soul Shard** และผ่านตัวคูณเดียวกับ Shard อื่น (ชนะ/แพ้/ยอมแพ้/ทำโอที) (D18) · ทุกข้อต้องทำได้ในรอบ Casual ปกติทุกวันที่สุ่มขึ้น

| id | TH | EN | เงื่อนไข | รางวัล |
|---|---|---|---|---|
| QUEST_01 | เก็บไม้ 20 ชิ้น ไปต่างโลกก็ยังต้องทำงานใช้แรง | Gather 20 wood. Reincarnation doesn't skip chores. | เก็บไม้ครบ 20 ชิ้นในรอบเดียว | 4 Soul Shard |
| QUEST_02 | กินมื้อเย็นให้ครบ 3 คืน แม่ฝากมาบอก | Eat dinner 3 nights. Your mom asked us to check. | กินมื้อเย็น 3 คืนในรอบเดียว | 5 Soul Shard |
| QUEST_03 | ล้มเองให้ได้ 5 ครั้ง เพื่อวิทยาศาสตร์ (กับดักสะดุดล้มช่วยได้) | Fall over 5 times. For science. Tip: the Trip Trap helps. | ผู้เล่นล้มรวม 5 ครั้ง จาก {skill:J02} หรือ [กับดักสะดุดล้ม] ในทางเลือกเย็นนี้ (§6, เลือกได้ทุกเย็นจึงทำได้ทุกรอบ) | 5 Soul Shard |
| QUEST_04 | ผสมสกิล 1 ครั้ง ของขวัญฟรีไม่นับ ระบบจำได้ | Fuse once. The free gift doesn't count. We checked. | ผสมสกิลจาก Draft 1 ครั้ง (ไม่นับ tutorial) | 5 Soul Shard |
| QUEST_05 | ปราบมอน 300 ตัว ไม่ต้องรู้สึกผิด พวกมันเกิดใหม่ได้ | Defeat 300 monsters. Relax, they have great respawn benefits. | ฆ่ามอนครบ 300 ตัวในรอบเดียว | 5 Soul Shard |
| QUEST_06 | เปิดหีบเสี่ยง 3 ใบ ชีวิตต้องมีลุ้น | Open 3 risky chests. What's the worst that could happen? | เปิดหีบเสี่ยง 3 ใบ | 5 Soul Shard |
| QUEST_07 | รอดคืนที่ 3 โดยแกนฐานเกิน 50% บ้านต้องสวย | Clear night 3 with the core above 50%. Keep the house tidy. | จบคืนที่ 3 ขณะแกนฐาน HP > 50% | 5 Soul Shard |
| QUEST_08 | สร้างรั้วขยะ 1 ครั้ง ขยะของคนหนึ่งคือรั้วของอีกคน | Build a Junk Fence. One person's trash is another's wall. | เลือก "รั้วขยะ" ในทางเลือกเย็นนี้ 1 ครั้ง | 4 Soul Shard |
| QUEST_09 | ห้าม reroll ทั้งรอบ เชื่อในโชคชะตา (ที่ระบบจัดให้) | Zero rerolls this run. Trust the process. Our process. | ผ่านคืนที่ 3 ขึ้นไปโดยไม่ reroll Draft เลย | 5 Soul Shard |
| QUEST_10 | ปราบมอน 10 ตัวด้วยอุกกาบาตตัวเอง เจ็บนี้มีความหมาย | Take out 10 monsters with your own meteor. Pain is a strategy. | ฆ่ามอน 10 ตัวด้วย {skill:R01a} ในรอบเดียว — ตัวทดลองจากของขวัญคืนที่ 1 (มีทุกรอบ Casual) หรือที่ผสมเองก็นับ · ถ้าเกมปิดของขวัญต้อนรับสำหรับผู้เล่นบางกลุ่มในอนาคต ห้ามสุ่มข้อนี้ให้ผู้เล่นกลุ่มนั้น | 5 Soul Shard |

## 5. อีเวนต์ระบบ (6)

ขึ้น 1–2 ครั้ง/รอบ ช่วงกลางวัน (§8) ผลลัพธ์ผูกกับ event RNG (§10 บันทึกตัวเลือกที่ค้าง) ในโหมด Daily รางวัลที่เป็น Shard ให้ใช้บัฟในรอบแทน

### EV1 — แลกสกิลห่วยกับกล่องสุ่ม
กลไก: เอาสกิลขยะ (J-series) ที่เลเวลต่ำสุดออก แล้วสุ่มสกิลใหม่ 1 ใบตามตารางความหายากของ Draft ใน MVP (D3: Common 55 / Rare 28 / Epic 12 / Legendary 5, ไม่มี Mythic) ไม่ซ้ำของเดิม · ได้ Rare ขึ้นไป → RES_A_GOOD, ได้ Common → RES_A_BAD · ถ้าไม่ได้ถือสกิลขยะ อีเวนต์นี้ไม่ขึ้น

| id | TH | EN |
|---|---|---|
| EV1_OPEN | ข้อเสนอพิเศษ! แลกสกิลขยะ 1 ชิ้น กับกล่องสุ่มลึกลับ | Limited offer: trade one trash skill for a Mystery Box™. |
| EV1_OPT_A | แลก! ชีวิตคือกาชา | Deal. Life is a gacha. |
| EV1_OPT_B | ไม่แลก เราผูกพันกันแล้ว | No. We've bonded. |
| EV1_RES_A_GOOD | ได้ Rare ขึ้นไป! ระบบงงพอๆ กับคุณ | Rare or better! The System is equally confused. |
| EV1_RES_A_BAD | ได้ Common ใบใหม่ ขยะเปลี่ยนถุง กลิ่นเดิม | Common. Different trash, same smell. |
| EV1_RES_B | ระบบเคารพความรัก แม้จะเป็นความรักที่ผิดที่ | Respect. Questionable taste, but respect. |

### EV2 — ข้อตกลงการใช้งาน 4,000 หน้า
กลไก: A = ดาเมจ +20% คืนนี้ แต่มอนเร็ว +10% คืนนี้ / B = ตัวละครนั่งอ่าน เสียเวลากลางวัน 10 วิ แลก XP +15% คืนนี้

| id | TH | EN |
|---|---|---|
| EV2_OPEN | กรุณายอมรับข้อตกลงการใช้งานต่างโลก (4,000 หน้า) | Please accept the Terms of Reincarnation (4,000 pages). |
| EV2_OPT_A | ยอมรับ (ไม่ได้อ่าน) | Accept (did not read) |
| EV2_OPT_B | ขออ่านก่อน | Actually read it |
| EV2_RES_A | ข้อ 3,912: มอนวิ่งเร็วขึ้น 10% ขอบคุณที่ไม่อ่านค่ะ | Clause 3,912: monsters +10% speed. Thanks for not reading! |
| EV2_RES_B | คุณคือคนแรกที่อ่านจริง ระบบซึ้งจนต้องให้ XP เพิ่ม | First person to ever read it. The System is moved. Have XP. |

### EV3 — ระบบขออัปเดต
กลไก: A = ตัวละครหยุดนิ่ง 3 วิ แล้ว Passive สุ่ม 1 ตัว +1 เลเวล / B = ไม่มีผล (30% ที่อีเวนต์นี้จะเด้งซ้ำวันถัดไป)

| id | TH | EN |
|---|---|---|
| EV3_OPEN | ระบบกำลังอัปเดต กรุณาอย่าปิดเครื่อง (เครื่อง = คุณ) | Installing update. Do not turn off your device. You are the device. |
| EV3_OPT_A | อัปเดตเลย | Update now |
| EV3_OPT_B | เตือนอีกครั้งพรุ่งนี้ | Remind me tomorrow |
| EV3_RES_A | อัปเดตเสร็จ! ฟีเจอร์ใหม่: เก่งขึ้นนิดนึง บั๊กเดิม: คุณ | Update complete. New: slightly stronger. Known issue: still you. |
| EV3_RES_B | รับทราบ ระบบจะถามใหม่ในเวลาที่ไม่สะดวกที่สุด | Sure. We'll ask again at the least convenient moment. |

### EV4 — แบบสอบถามความพึงพอใจของระบบ
กลไก: A = ฟื้น HP 30% / B = คืนนี้มอนเพิ่ม 3 ตัว (ซึ่งก็คือ XP เพิ่ม ไม่ใช่การลงโทษจริง) · ไม่มีดาว/คะแนน และไม่เชื่อมกับรีวิวสโตร์ใดๆ (D24)

| id | TH | EN |
|---|---|---|
| EV4_OPEN | แบบสอบถามจากระบบ 1 ข้อ: "ระบบดูแลคุณดีไหม" ไม่มีผลอะไร... มั้ง | System survey: "Is the System treating you well?" No effect. Probably. |
| EV4_OPT_A | ดีมาก ไม่มีอะไรจะติ | Very well. No notes. |
| EV4_OPT_B | ควรปรับปรุง | Needs improvement |
| EV4_RES_A | ขอบคุณค่ะ ระบบจะจำความดีนี้ไว้ (ฟื้น HP ให้นิดนึง) | Thank you! Kindness noted. Have some HP. |
| EV4_RES_B | รับทราบ ระบบไม่ได้น้อยใจ ปล. คืนนี้มอนเพิ่ม 3 ตัว | Noted. The System is not upset. Unrelated: 3 bonus monsters tonight. |

### EV5 — แมวต่างโลก
กลไก: A = ได้แมวติดตาม (summon, tag สัตว์) ถึงรุ่งเช้าคืนถัดไป ตีมอนบ้างตามอารมณ์ / B = ไม่มีผล

| id | TH | EN |
|---|---|---|
| EV5_OPEN | แมวต่างโลกเดินมานั่งจ้อง มันกำลังประเมินคุณ | A strange cat is staring at you. You are being evaluated. |
| EV5_OPT_A | รับเลี้ยง | Adopt |
| EV5_OPT_B | ทำเป็นไม่เห็น | Pretend you didn't see it |
| EV5_RES_A | ยินดีด้วย แมวยอมรับคุณเป็นทาสอย่างเป็นทางการ | Congratulations. The cat has accepted you as staff. |
| EV5_RES_B | แมวเดินจากไป แต่มันจำหน้าคุณไว้แล้ว | The cat leaves. It will remember this. |

### EV6 — กล่องที่ห้ามเปิด
กลไก: A = 50% ได้ Draft ฟรีทันที 1 รอบ (การ์ดทุกใบความหายาก Rare ขึ้นไป, ไม่ใช้ reroll) / 50% ฝูงมอนเกิดรอบตัว 8 ตัว / B = ฟื้น HP 20% + แกนฐาน +5% · **ไม่มี Fusion Core** (D17)

| id | TH | EN |
|---|---|---|
| EV6_OPEN | ห้ามเปิดกล่องนี้ (ระบบพูดจริง รอบนี้ไม่ใช่มุก) | Do NOT open this box. (We're serious this time.) |
| EV6_OPT_A | เปิดสิ รออะไร | Obviously open it |
| EV6_OPT_B | เชื่อระบบสักครั้ง | Trust the System, just once |
| EV6_RES_A_GOOD | ในกล่องมีการ์ดสกิลเกรดดี... ระบบลืมเอาออก ขอคืนได้ไหม | Good skill cards inside. We forgot to take those out. Give them back? |
| EV6_RES_A_BAD | ระบบบอกแล้ว ระบบบอกแล้ว ระบบบอกแล้ว | We told you. We told you. We told you. |
| EV6_RES_B | ผู้เล่นคนแรกที่เชื่อฟัง! ระบบซึ้งจนเผลอฮีลให้ | You listened?! Nobody listens. Here, have a heal. |

## 6. ทางเลือกเย็นนี้ (3)

ตาม §4 · "ทำโอทีกะดึก" ไม่มีในโหมด Daily (และรอบ `?seed=`)

กลไก:
- EVE_FENCE: จ่ายอาหาร 1 ชิ้น → แกนฐานได้**โล่** = 30% ของ HP สูงสุด **เฉพาะคืนนั้น** (โล่หายตอนรุ่งเช้า ไม่ได้เพิ่ม HP) (D9)
- EVE_TRIP: กับดักสะดุดล้ม มอนล้ม 2 วิ ผู้เล่นเหยียบเองก็ล้ม (นับใน QUEST_03)
- EVE_OT: **เปิดตั้งแต่เย็นวันที่ 4**, Soul Shard **+20% ของทั้งรอบ** (คิดตอนจบรอบ), เลือกได้ครั้งเดียวต่อรอบ, คืนนั้นไม่ได้มื้อเย็น (ติดดีบัฟหิว) (D9, D18, D24)

| id | TH | EN |
|---|---|---|
| EVE_FENCE | [รั้วขยะ] จ่ายอาหาร 1 ชิ้น แกนฐานได้โล่เฉพาะคืนนี้ ไม่สวยแต่กันได้ | Junk Fence: 1 food → core shield, tonight only. Ugly but load-bearing. |
| EVE_TRIP | [กับดักสะดุดล้ม] มอนล้ม 2 วิ คุณก็ล้มได้ เพราะคุณคือคุณ | Trip Trap: monsters fall for 2s. So might you. It's tradition. |
| EVE_OT | [ทำโอทีกะดึก] Shard +20% ทั้งรอบ แต่อดข้าวเย็น เหมือนชาติก่อนเป๊ะ | Unpaid Overtime: +20% Shards, no dinner. Just like your past life. |
| EVE_OT_DONE | ลงเวลาออกงานแล้ว... ล้อเล่น มอนยังไม่เลิกงาน คุณก็เหมือนกัน | Clocked out. Kidding. The monsters work nights too. |

## 7. จบรอบ / ผลลัพธ์

### 7.1 ตาย / แพ้ (8)
DOWN = ผู้เล่น HP 0 (ฟื้นที่ฐานใน 10 วิ แกนฐาน -15%) / LOSE = แกนฐานพัง (§5)

| id | TH | EN |
|---|---|---|
| DOWN_01 | คุณล้ม (รอบนี้ไม่ใช่สกิล) ฟื้นใน 10 วิ แกนฐานออกค่ารักษาให้ | You're down. Respawn in 10s. The core is covering your hospital bill. |
| DOWN_02 | ตายครั้งที่สองของชีวิต ตัวนับของระบบนับได้ถึงหนึ่ง เลยค้างไปแล้ว | Second death this lifetime. Our counter only goes to one. It crashed. |
| DOWN_03 | อุกกาบาตหยุดตกตอนคุณเหลือ 20% ตามสัญญา แต่สไลม์ไม่ได้เซ็นด้วย | Your meteor stopped at 20% HP, as agreed. The slime never signed. |
| DOWN_04 | ล้มบนกับดักตัวเอง มอนขอบคุณสำหรับความร่วมมือ | Tripped on your own trap. The monsters appreciate your cooperation. |
| LOSE_01 | แกนฐานพังแล้ว ผู้รับเหมาของระบบขอปิดมือถือหนีชั่วคราว | Base core destroyed. The System's contractor stopped taking calls. |
| LOSE_02 | จบที่คืนที่ {n} ขอเกิดใหม่เป็นตัวร้ายแทนได้ไหม? ไม่ได้ค่ะ | Fell on night {n}. Requesting villain respawn... Denied. |
| LOSE_03 | แพ้... แต่ยังได้ Shard ครึ่งหนึ่ง ระบบใจดีแบบมีเงื่อนไข | Defeated. You keep half your Shards. We're generous. Conditionally. |
| LOSE_04 | มอนฉลองกันใหญ่ ทั้งที่รู้ว่าเดี๋ยวคุณก็เกิดใหม่มาอีก | The monsters are partying. Nobody told them you respawn. |

DOWN_03 ขึ้นเฉพาะโหมด Casual เมื่อ {skill:R01a} หยุดร่ายเองเพราะ HP ≤20% ในคืนนั้น แล้วผู้เล่นโดนมอนตีจนล้ม (D15)

### 7.2 ยอมแพ้ (3) — กลางวันเท่านั้น, Shard ×0.5 (เท่ากับแพ้, D18)

| id | TH | EN |
|---|---|---|
| QUIT_01 | ยอมแพ้เหรอ? ระบบเข้าใจ อาทิตย์นี้ระบบเองก็ยื่นใบลาไปสองรอบ | Surrender? Understood. The System filed for leave twice this week. |
| QUIT_02 | ได้ Shard ครึ่งเดียว เท่าแพ้เป๊ะ ระบบคิดเลขไม่เก่ง เลยทำให้ง่าย | Half your Shards, same as losing. We kept the math simple. For us. |
| QUIT_03 | กลับกลางวันแสกๆ มอนยังไม่ทันได้ทักทายเลย | Leaving in broad daylight? The monsters didn't even get to say hi. |

### 7.3 ชนะ (4) — Shard +30%

| id | TH | EN |
|---|---|---|
| WIN_01 | รอดครบ 7 คืน! ระบบขอถอนคำพูดที่ผ่านมา... เกือบทั้งหมด | 7 nights survived. The System retracts most of its comments. |
| WIN_02 | จันทร์เลือดดับแล้ว ด้วยสกิลที่เริ่มจากขยะ ขยะก็มีวันของมัน | Blood Moon down. Built from trash. Trash had its day. |
| WIN_03 | ชนะ! Shard +30% ระบบไม่ได้ปรบมือนะ มือมันลื่น | Victory! +30% Shards. That wasn't applause. Our hand slipped. |
| WIN_04 | เลื่อนขั้นจาก "ตัวประกอบ" เป็น "ตัวประกอบที่รอด" ยินดีด้วย | Promoted: from "Extra" to "Extra Who Survived." |

### 7.4 ผสมสกิลสำเร็จ (5)

| id | TH | EN |
|---|---|---|
| FUSE_01 | ผสมสำเร็จ! ขยะ + ขยะ = ไม่ใช่ขยะ คณิตศาสตร์ต่างโลกค่ะ | Fusion complete. Trash + trash = not trash. Don't check our math. |
| FUSE_02 | ระบบไม่รู้ว่ามันได้ยังไง แต่มันได้ | Nobody knows why it works. It works. |
| FUSE_03 | ช่องสกิลว่าง 1 ช่อง ความว่างเปล่าที่น่าภูมิใจ | One slot freed. Inner peace, but for your inventory. |
| FUSE_04 | ช่อง ??? ในสารานุกรมลดลง ระบบเริ่มกังวลแล้ว | Another ??? revealed. The Encyclopedia is getting nervous. |
| FUSE_05 | ผสมเองครั้งแรก! ไม่มีทดลองใช้ฟรี นี่ของจริงทั้งหมด | Your first real fusion. No free trial. That was all you. |

FUSE_02 แสดงใต้สูตร `{A} + {B} = {C}` ที่ UI วาดเป็นบรรทัดแยก (ชื่อ 3 สกิลรวมกันอาจยาวเกิน 70 ถ้ารวมบรรทัดเดียว)

FUSE_05 ใช้ครั้งเดียวต่อเซฟ (ผสมเองครั้งแรกที่ไม่ใช่ tutorial)

### 7.5 ระบบช่วยเหลือ / เซฟ / seed (5)

| id | ตอนขึ้น | TH | EN |
|---|---|---|---|
| RECALL_01 | กดปุ่ม "เรียกคืนเร็ว" ตอนกลางวัน (D22) | เรียกคืนเร็ว! ข้ามไปตอนเย็นเลย มอนยังแต่งตัวไม่เสร็จ | Early recall! Skipping to dusk. The monsters aren't dressed yet. |
| RECALL_02 | ต่อจาก RECALL_01 ถ้ายังมีของบนแผนที่ (ไม่มีโบนัส ไม่มีโทษ) | ของที่ยังไม่เก็บ ระบบขอบริจาคให้ธรรมชาติ ไม่มีโบนัสนะ | Unlooted stuff has been donated to nature. No bonus. Just vibes. |
| IMPORT_01 | import save จากเมนูหลัก ขณะมีรอบค้าง → รอบเก่านับเป็นยอมแพ้ (D19) | นำเข้าเซฟแล้ว รอบที่ค้างนับเป็นยอมแพ้ มอนที่รออยู่ผิดหวังมาก | Save imported. Old run = surrender. The monsters waited for nothing. |
| PRACTICE_01 | เริ่ม Daily ครั้งที่ 2+ ของวัน (D19) | Daily วันนี้นับไปแล้ว รอบนี้เป็น "ซ้อม" ระบบจะบอกทุกคนบนการ์ด | Daily already counted today. This one's "Practice". It's on the card. |
| SEED_01 | เริ่มรอบจากลิงก์ `?seed=` (D19) | รอบจากลิงก์เพื่อน เล่นได้เต็มที่ แต่ไม่ได้ Shard ระบบไม่ใช่สปอนเซอร์ | Friend's seed: full run, zero Shards. The System isn't a sponsor. |

## 8. เครื่องกำเนิดชื่อ build (การ์ดแชร์)

**Template:** `{PREFIX}{CORE}{SUFFIX}` (TH ไม่ต้องเว้นวรรคระหว่างส่วน; EN คั่นด้วยเว้นวรรค) · id เดียวกันของ PREFIX/CORE/SUFFIX ใช้ความหมายเดียวกันทั้ง TH และ EN (ถ้อยคำต่างกันได้)
- PREFIX: สุ่มด้วย seed ของรอบ (แชร์ ?seed= แล้วได้ชื่อเดิม)
- CORE (เรียงตามลำดับ ใช้ข้อแรกที่ตรง): (1) CORE_12 ถ้าเลือกรั้วขยะ ≥3 คืน → (2) CORE ที่ผูกกับ id สกิลที่ทำดาเมจสูงสุดในรอบ → (3) synergy tag ที่มีจำนวนสกิลมากที่สุด (เสมอกันใช้ tag ของสกิลดาเมจสูงสุด) → (4) สุ่มด้วย seed
- SUFFIX: ถ้ามีหลายเงื่อนไขตรงพร้อมกัน ใช้ลำดับความสำคัญ **SUF_03 > SUF_07 > SUF_04 > SUF_05 > SUF_11 > SUF_08** (เฉพาะเจาะจงก่อนทั่วไป) ใช้ข้อแรกที่ตรงเพียงข้อเดียว ถ้าไม่มีข้อไหนตรง สุ่มจากคำที่ไม่มีเงื่อนไข (—) ด้วย seed
- ความยาว: นับแบบ grapheme ถ้าชื่อเต็มเกิน 70 ให้ตัด SUFFIX ทิ้ง (ไม่ไล่หา SUFFIX ลำดับถัดไป) — เช็กแยกต่อภาษา จึงอาจตัดภาษาเดียว

### 8.1 PREFIX (คำนำหน้า)

| id | TH | EN |
|---|---|---|
| PRE_01 | เกิดใหม่ทั้งทีก็ดันเป็น | Reborn as the |
| PRE_02 | ถูกรถชนแล้วกลายเป็น | So I Got Hit by a Truck and Became the |
| PRE_03 | ตำนาน | The Legend of the |
| PRE_04 | บันทึกลับของ | Secret Diary of the |
| PRE_05 | เมื่อฉันกลายเป็น | That Time I Became the |
| PRE_06 | ชีวิตสโลว์ไลฟ์ของ | My Slow Life as the |
| PRE_07 | ถูกไล่ออกจากปาร์ตี้ แต่ดันเป็น | Kicked from the Party, Now I'm the |
| PRE_08 | ไม่ได้อยากเก่ง แต่ดันเป็น | I Never Asked to Be the |
| PRE_09 | ระบบส่งมาให้เป็น | The System Made Me the |
| PRE_10 | คู่มือเอาตัวรอดของ | Survival Guide of the |
| PRE_11 | ชาติก่อนเป็นพนักงานออฟฟิศ ชาตินี้เป็น | Ex-Office Worker, Now the |
| PRE_12 | ปฐมบทแห่ง | Prologue of the |

### 8.2 CORE (แกนกลาง)

| id | ผูกกับ | TH | EN |
|---|---|---|---|
| CORE_01 | J03 | นักขว้างหิน | Rock-Throwing Prodigy |
| CORE_02 | J02 / R01b | จอมสะดุด | Professional Tripper |
| CORE_03 | R01a | อุกกาบาตเดินได้ | Walking Meteor |
| CORE_04 | J01 / R02a | เจ้าพายุฝุ่น | Dust Tornado Lord |
| CORE_05 | J04 / R02b | จอมเวทไฟติดยาก | Barely-Lit Archmage |
| CORE_06 | tag ไฟ | เชฟเพลิงนรก | Hellfire Chef |
| CORE_07 | tag น้ำแข็ง | จอมเวทน้ำแข็งขี้หนาว | Frost Mage Who Hates Cold |
| CORE_08 | tag สายฟ้า | มนุษย์ปลั๊กพ่วง | Human Power Strip |
| CORE_09 | tag สัตว์ | ทาสแมวผู้ยิ่งใหญ่ | Supreme Cat Servant |
| CORE_10 | tag ดิน | สถาปนิกโคลน | Mud Architect |
| CORE_11 | tag เงา | ฝึกงานแห่งเงา | Shadow Intern |
| CORE_12 | รั้วขยะ (เลือก ≥3 คืน) | อัศวินรั้วขยะ | Junk Fence Paladin |

### 8.3 SUFFIX (คำลงท้าย)

| id | เงื่อนไข | TH | EN |
|---|---|---|---|
| SUF_01 | — | ที่ไม่มีใครขอ | Nobody Asked For |
| SUF_02 | — | แต่อยากนอนเฉยๆ | Who Just Wants a Nap |
| SUF_03 | ชนะโดยแกนฐาน ≤10% | กับบ้านที่เหลือ 1% | with 1% Base HP |
| SUF_04 | เลือกทำโอทีกะดึก | ผู้ทำโอทีไม่ได้ค่าแรง | Who Works Unpaid Overtime |
| SUF_05 | อดมื้อเย็น ≥3 คืน | ผู้ไม่เคยได้กินข้าวเย็น | Who Skipped Dinner (Again) |
| SUF_06 | — | ที่ระบบไม่ค่อยปลื้ม | the System Barely Tolerates |
| SUF_07 | ดาเมจอันดับ 1 = สกิลขยะ | ผู้ทำลายสมดุลโลกด้วยขยะ | Who Broke the Meta with Trash |
| SUF_08 | ชนะ | ผู้รอดครบ 7 คืน (เกือบไม่รอด) | Who Survived 7 Nights (Barely) |
| SUF_09 | — | ฉบับทดลองใช้ฟรี | (Free Trial Edition) |
| SUF_10 | — | ที่หมอกยังไม่กล้ากลืน | the Fog Is Scared Of |
| SUF_11 | ไม่เคยผสมสกิล | ผู้ไม่เชื่อในการผสม | Who Refuses to Fuse |
| SUF_12 | — | ฉบับรีมาสเตอร์ | (Remastered) |

### 8.4 ตัวอย่างผลลัพธ์ (5 + 5)

แต่ละแถวใช้ id ชุดเดียวกันทั้งสองภาษา

| # | ids | TH | EN |
|---|---|---|---|
| 1 | PRE_01 + CORE_03 + SUF_01 | เกิดใหม่ทั้งทีก็ดันเป็นอุกกาบาตเดินได้ที่ไม่มีใครขอ | Reborn as the Walking Meteor Nobody Asked For |
| 2 | PRE_07 + CORE_09 + SUF_12 | ถูกไล่ออกจากปาร์ตี้ แต่ดันเป็นทาสแมวผู้ยิ่งใหญ่ฉบับรีมาสเตอร์ | Kicked from the Party, Now I'm the Supreme Cat Servant (Remastered) |
| 3 | PRE_06 + CORE_02 + SUF_03 | ชีวิตสโลว์ไลฟ์ของจอมสะดุดกับบ้านที่เหลือ 1% | My Slow Life as the Professional Tripper with 1% Base HP |
| 4 | PRE_11 + CORE_08 + SUF_04 | ชาติก่อนเป็นพนักงานออฟฟิศ ชาตินี้เป็นมนุษย์ปลั๊กพ่วงผู้ทำโอทีไม่ได้ค่าแรง | Ex-Office Worker, Now the Human Power Strip Who Works Unpaid Overtime |
| 5 | PRE_03 + CORE_01 + SUF_07 | ตำนานนักขว้างหินผู้ทำลายสมดุลโลกด้วยขยะ | The Legend of the Rock-Throwing Prodigy Who Broke the Meta with Trash |

## 9. ผลแชร์ Daily Seed (อีโมจิ)

สัญลักษณ์: 1 ช่อง = 1 คืน, 🟩 แกนฐาน >66% / 🟨 33–66% / 🟥 <33% เมื่อจบคืน, 💀 แกนฐานพัง, ⬛ ไม่ได้ไปถึง, 🌕 ชนะบอสจันทร์เลือด; ⚗️ = จำนวนครั้งที่ผสม; บรรทัดสุดท้ายเป็นคำแซวของระบบ (สุ่มตาม seed) ไม่มีอีโมจิ ads เพราะโหมด Daily ปิด ads; ใส่ชื่อเกมผ่าน `{GAME}` = "Rift & Rubbish" (ชื่อสั้นของ Rift & Rubbish: System Error, 14 grapheme)
- Daily ครั้งที่ 2+ ของวัน: ต่อท้ายบรรทัดแรกด้วย `[ซ้อม]` / `[Practice]` (D19)
- คำแซวบรรทัดสุดท้ายตอนแพ้: แซวระบบหรือมอน ไม่ซ้ำเติมผู้เล่น (D24)

**บรรทัดสถิติ (บรรทัดที่ 4) — เลือก 1 บรรทัด** ตามลำดับ ใช้ข้อแรกที่ถึงเกณฑ์:

| ลำดับ | เกณฑ์ | TH | EN |
|---|---|---|---|
| 1 | {skill:R01a} ร่ายรวม ≥10 ครั้ง | ☄️ ใส่ตัวเอง {k} ครั้ง | ☄️ Self-meteored: {k} |
| 2 | ผู้เล่นล้มรวม ≥5 ครั้ง ({skill:J02}/{skill:R01b}/กับดัก) | 🦵 ล้มเอง {k} ครั้ง | 🦵 Fell over: {k} |
| 3 | {skill:J04} จุดไม่ติดรวม ≥10 ครั้ง | 🔥 ขีดไฟไม่ติด {k} ครั้ง | 🔥 Failed to light: {k} |
| 4 | อดมื้อเย็น ≥2 คืน | 🍚 อดข้าวเย็น {k} คืน | 🍚 Dinners skipped: {k} |
| 5 | (ค่าเริ่มต้น) | ⚔️ ปราบมอน {k} ตัว | ⚔️ Monsters defeated: {k} |

### ตัวอย่าง A — ชนะ (TH)
```
{GAME} Daily #042 🌕 รอดครบ 7 คืน
🟩🟩🟨🟨🟥🟨🌕
⚗️×2 (คืน 2, 5) 🗑️→✨
☄️ ใส่ตัวเอง 14 ครั้ง
ระบบ: "ไม่เลว... สำหรับมนุษย์"
?seed=20261112
```

### ตัวอย่าง B — แพ้, เล่นซ้ำ (EN)
```
{GAME} Daily #042 💀 Night 4 [Practice]
🟩🟨🟥💀⬛⬛⬛
⚗️×0 🗑️🗑️🗑️🗑️
🦵 Fell over: 6
System: "The monsters got lucky. We're reviewing the footage."
?seed=20261112
```
