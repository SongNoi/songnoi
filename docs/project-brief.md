# SongNoi — Project Brief
 
> **Just send it. Your data stays home.**
> Self-hosted form builder ที่ข้อมูลเป็นของคุณ 100% และ custom ได้ถึงระดับโค้ด
 
อัปเดตล่าสุด: 2026-11-04
สถานะ: โปรเจ็คส่วนตัวทำเล่นๆ เปิดเป็น Open Source
License: MIT
 
## 0. ชื่อและแบรนด์
 
- **ชื่อ:** SongNoi — มาจาก "ส่งหน่อย" ประโยคที่คนพูดจริงตอนแปะลิงก์ฟอร์มให้คนอื่นตอบ
- **การเขียน:** ใช้ **SongNoi** (S และ N ตัวใหญ่) ทุกที่ที่เป็นแบรนด์ เพื่อไม่ให้ชาวต่างชาติอ่านเป็นคำว่า "song" (เพลง) ส่วนชื่อ package และ repo ใช้ตัวเล็ก `songnoi`
- **บรรทัดแรกของ README:** *SongNoi (ส่งหน่อย, "just send it") — a self-hosted form builder*
- **เหตุผลที่เลือก:** ไม่มีคำว่า form ในชื่อ เพื่อให้จดเครื่องหมายการค้าได้ และไม่ผูกชื่อไว้กับแบบฟอร์มอย่างเดียว
- **ชื่อเดิม:** Formstead (เลิกใช้เพราะ GitHub ชนและมีคำว่า form)
---
 
## 1. ที่มา (Pain จากการใช้ Google Form)
 
เรียงตามความสำคัญ — สองข้อแรกคือ "หัวหอก" ของโปรเจ็ค
 
1. **Custom ได้น้อย** ⭐
2. **ข้อมูลไม่เป็นของตัวเอง** ⭐
3. คุมสิทธิ์การเข้าถึงไม่ได้
4. เชื่อมต่อระบบอื่นยาก
5. หน้าตาไม่สวย
6. การแสดงผลและวิเคราะห์ข้อมูลทำได้ในมุมมองที่จำกัด (ดูได้ทีละข้อ ตัดมุมมองข้ามคำถามไม่ได้)
ข้อ 3–6 ต้องได้มาจากการออกแบบข้อ 1–2 ให้ถูก ไม่ใช่ feature แยกที่ต่อเติมทีหลัง
 
## 2. หลักการออกแบบ
 
- **Schema คือพระเอก** — Form Schema (JSON ที่ตรวจด้วย Zod) เป็นหัวใจ ทุกส่วนที่เหลือเป็นแค่ตัวอ่านหรือเขียน schema
- **Dogfooding the plugin API** — field ที่มากับระบบต้องสร้างด้วย `defineField` เดียวกับที่คนนอกใช้ ห้ามมีทางลัดพิเศษ
- **Self-host first** — `docker compose up` คำสั่งเดียวต้องได้ระบบครบ ข้อมูลและไฟล์ไม่ออกจากเครื่องผู้ใช้
- **แยกโลกคนสร้างฟอร์มกับคนตอบฟอร์ม** — auth และสิทธิ์คนละชุด
- **ไม่สร้าง BI เอง** — หยุดที่ analytics 3 ชั้น แล้วเปิดทางออกให้เครื่องมือ BI ภายนอก
- **Scope เล็กแต่ใช้ได้จริง** — โปรเจ็คเล่นๆ ตายเพราะไปไม่ถึงจุดใช้งานได้ ไม่ใช่เพราะโค้ดยาก
- **MIT ทั้ง monorepo (ตัดสินใจ 2026-11-04)** — ให้แก้โค้ด เขียน field plugin และฝัง `@songnoi/renderer` ได้อิสระ ไม่ใช้ AGPL เพราะจะขัดกับหัวหอก "custom ได้ถึงระดับโค้ด" ส่วนชื่อ SongNoi คุ้มครองด้วยเครื่องหมายการค้า (เพิ่ม `TRADEMARK.md` ภายหลัง)
## 3. Tech Stack
 
| ส่วน | เลือกใช้ |
|---|---|
| Framework | Next.js (App Router) |
| UI | shadcn/ui + Tailwind, shadcn Chart (ห่อ Recharts) |
| ORM / DB | Prisma + PostgreSQL (ใช้ JSONB) |
| Validation | Zod |
| Auth | Better Auth |
| Drag & drop | dnd-kit |
| Conditional logic | JSON Logic (ไม่คิดภาษาเงื่อนไขเอง) |
| File storage | S3-compatible (RustFS สำหรับ self-host) |
| Deploy | Docker Compose |
| Monorepo | pnpm workspace + Turborepo (แนะนำ) |
 
## 4. โครงสร้าง Repo
 
```
packages/
  schema/      ← นิยามฟอร์ม + defineField (Zod) — หัวใจของระบบ
  renderer/    ← แสดงฟอร์มจาก schema ด้วย shadcn — ใช้แยกในโปรเจ็คอื่นได้
apps/
  web/         ← Builder + หลังบ้าน + ลิงก์แชร์ + analytics
registry/      ← แจก field component ผ่าน shadcn registry (npx shadcn add)
```
 
## 5. Field Plugin API
 
field หนึ่งชนิด = ไฟล์เดียวที่ครบทั้งวงจร ตั้งค่า → แสดงผล → ตรวจคำตอบ → export → วิเคราะห์
 
```ts
export const ratingField = defineField({
  type: "rating",
  config: z.object({ max: z.number().default(5), icon: z.enum(["star", "heart"]) }),
  answer: (cfg) => z.number().min(1).max(cfg.max),
  Render: RatingInput,       // หน้าที่คนตอบเห็น
  Settings: RatingSettings,  // แผงตั้งค่าใน Builder
  toCell: (v) => String(v),  // แปลงเป็นค่าใน export
  analytics: {
    storeAs: "number",               // column ในตาราง Answer
    summarize: "distribution+avg",
    groupable: false,                // ใช้เป็น "แยกตาม" ใน cross-tab ได้ไหม
    Chart: RatingChart,
  },
})
```
 
Built-in field ชุดแรก (8 ชนิด): text, textarea, number, choice, checkbox, dropdown, date, rating
 
## 6. Data Model (หลัก)
 
```prisma
model Form        { id, workspaceId, slug, draftSchema Json, versions FormVersion[] }
model FormVersion { id, formId, version Int, schema Json, publishedAt }   // publish แล้วห้ามแก้
model Response    { id, formVersionId, answers Json, respondentId?, submittedAt }  // ต้นฉบับ
 
model Answer {    // สำเนาแตกเป็นแถว สำหรับวิเคราะห์
  responseId  String
  fieldId     String
  valueText   String?
  valueNumber Float?
  valueDate   DateTime?
  @@index([fieldId, valueText])
}
```
 
กติกา:
- `Response` ผูกกับ `FormVersion` เสมอ ไม่ใช่ `Form` — กันปัญหาคำตอบเก่าชี้ไปหาคำถามที่ถูกลบ
- เขียน `Response` และ `Answer` ใน transaction เดียวตอน submit
## 7. สิทธิ์และการยืนยันตัวตน
 
**คนสร้างฟอร์ม (Admin)** — login เต็มรูปแบบ, Workspace role: Owner / Editor / Viewer
 
**คนตอบฟอร์ม (Respondent)** — เลือก Access mode ต่อฟอร์ม:
- Public
- ลิงก์มี token
- รหัสผ่าน
- ต้อง login
- จำกัดโดเมนอีเมล (เช่น `@mahidol.ac.th`)
## 8. การเชื่อมต่อระบบอื่น
 
- Webhook เมื่อมีการส่งฟอร์ม
- REST API พร้อม API key
- Export CSV
- ฝังฟอร์มในเว็บอื่น (embed) และใช้ `@songnoi/renderer` ตรงๆ
- Postgres View อัตโนมัติต่อฟอร์ม (หนึ่งคำถาม = หนึ่ง column) ให้ Metabase / Looker Studio ต่อได้
## 9. Analytics 3 ชั้น
 
1. **Auto Summary ต่อคำถาม** — กราฟเลือกตามชนิด field อัตโนมัติ
2. **Filter + Cross-tab** — ดูเฉพาะคำตอบที่ตรงเงื่อนไข และแยกคำถามหนึ่งตามอีกคำถามหนึ่ง (หัวใจของ Pain ข้อ 6)
3. **Saved View** — บันทึก filter + กราฟเป็นชุด แชร์เป็นลิงก์ได้ ล็อก filter เพื่อให้แต่ละคนเห็นเฉพาะข้อมูลส่วนของตัวเอง
## 10. Roadmap
 
**MVP**
1. `defineField` API + built-in field 8 ชนิด
2. Builder ลากวาง + preview สด
3. Publish → ลิงก์ → เก็บคำตอบ (ผูก FormVersion)
4. Docker Compose คำสั่งเดียว
5. Webhook + Export CSV
6. Access mode: Public + Login
7. Analytics ชั้น 1
**Phase 2**
- Analytics ชั้น 2 (Filter + Cross-tab) + Postgres View
- Conditional logic (JSON Logic)
- Theme ต่อฟอร์ม (design token)
- Access mode ที่เหลือ
**Phase 3**
- Workspace role ละเอียด
- Analytics ชั้น 3 (Saved View + scoped access)
- shadcn registry สำหรับ community field
- สร้างฟอร์มด้วย AI จากคำอธิบาย
## 11. สิ่งที่จงใจไม่ทำ (Non-goals)
 
- BI ในตัว (pivot table, custom formula, dashboard ลากวาง)
- ภาษาเงื่อนไขที่คิดขึ้นเอง
- SaaS แบบ multi-tenant ที่โฮสต์ให้คนอื่น (อย่างน้อยในช่วงแรก)
## 12. เรื่องที่ยังไม่ได้ตัดสินใจ
 
- การจองชื่อ: ✅ GitHub org จองแล้ว https://github.com/SongNoi (2026-11-04) และ npm org จองแล้ว https://www.npmjs.com/org/songnoi (2026-11-04)
- เครื่องหมายการค้า: ค้นในกรมทรัพย์สินทางปัญญาและ WIPO Global Brand Database จำพวก 9 และ 42 ก่อนยื่นจด
- โดเมน: ยังไม่ได้เช็ค
 