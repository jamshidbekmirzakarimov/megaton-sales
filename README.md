# Megaton — Savdo jarayonlari tasdiqlash

Xodim ism-familiyasi bilan kiradi, 5 ta bo'lim (Umumiy, B2B, B2C, B2G, Export)
bosqichlarini ko'rib chiqadi va har biriga **tasdiqlayman / tasdiqlamayman + izoh**
yozadi. Javoblar Supabase (PostgreSQL) bazasiga avtomatik saqlanadi.
Admin `/admin` panelidan kim qaysi bo'limga nima yozganini ko'rib turadi.

## Kirish modeli

| Kim | Qanday kiradi | Qayerda |
|---|---|---|
| **Xodim** | Faqat ism-familiya — **parol yo'q** | `/` |
| **Admin** | `admin` / `admin` | `/admin` |

Xodim birinchi marta ismini yozganda baza avtomatik hisob ochadi. Keyingi safar
ayni shu ismni yozsa — javoblari joyida turadi. Sessiya HttpOnly cookie'da
30 kun saqlanadi, "Chiqish" tugmasi uni uzadi.

> **Admin paroli `admin`.** Sayt internetga chiqsa uni albatta o'zgartiring:
> ```bash
> npm run admin-parol -- "kuchli-yangi-parol"
> ```

## Tuzilishi

```
index.html            xodimlar sahifasi (bitta fayl, build kerak emas)
admin.html            /admin — javob va izohlarni ko'rish paneli
api/_db.js            baza ulanishi (pg Pool) + json/readBody yordamchilari
api/_auth.js          parol (scrypt), sessiya cookie, guard'lar, rate limit
api/kirish.js         POST — xodim: ism bilan kirish
api/admin-kirish.js   POST — admin: username + parol
api/chiqish.js        POST — sessiyani yopadi
api/men.js            GET  — joriy foydalanuvchi + javoblari
api/javoblar.js       POST — javoblarni saqlaydi (upsert) | GET — o'qiydi
api/hisobot.js        GET  — admin uchun yig'ma hisobot
admin-parol.mjs       admin parolini o'zgartirish skripti
supabase_tables.sql   baza sxemasi (jadvallar, view'lar, RLS)
dev.mjs               lokal dev-server
```

## Baza

Supabase → SQL Editor → `supabase_tables.sql` ni nusxalab **RUN**.

> Fayl eski jadvallarni **o'chirib** qaytadan yaratadi va admin hisobini
> (`admin` / `admin`) qo'shadi.

| Jadval | Vazifasi |
|---|---|
| `foydalanuvchilar` | xodimlar (`nom_kalit`) va adminlar (`username_kalit` + `parol_hash`) |
| `sessiyalar` | cookie tokenining **sha256 xeshi**, muddati, IP |
| `bolimlar` | 5 ta savdo yo'nalishi |
| `javoblar` | har bosqich uchun holat + izoh, `unique(foydalanuvchi, bolim, bosqich)` |
| `v_javoblar` | admin uchun: kim · qaysi bo'lim · qaysi bosqich · holat · izoh |
| `v_hisobot` | odam × bo'lim kesimida yig'ma sanoq |

RLS yoqilgan va `anon` uchun barcha grantlar bekor qilingan — bazaga faqat
server (`DATABASE_URL`) kiradi. Supabase anon kaliti bilan hech narsa ko'rinmaydi.

## Lokal ishga tushirish

```bash
npm install
npm run dev            # http://localhost:3000
```

`.env.local` fayli kerak (repoga tushmaydi):

```
DATABASE_URL=postgresql://postgres.<ref>:<PAROL>@aws-0-<region>.pooler.supabase.com:6543/postgres
```

> **Parolni percent-encode qiling.** `#` → `%23`, `/` → `%2F`, `+` → `%2B`, `@` → `%40`.
> Kodlanmagan `#` URL'ni o'sha yerda kesib qo'yadi va ulanish umuman ishlamaydi.

> **6543** — transaction pooler porti. Serverless uchun aynan shu kerak
> (5432 to'g'ridan-to'g'ri ulanish, Vercel'da ulanishlar tez tugab qoladi).

Foydali buyruqlar:

```bash
npm run check                          # hamma JS faylining sintaksisi
npm run admin-parol -- "yangi-parol"   # admin parolini o'zgartirish
```

## Vercelga joylash

```bash
vercel login
vercel                 # birinchi marta — loyihani bog'laydi
vercel --prod          # ishga chiqarish
```

Vercel Dashboard → Project → **Settings → Environment Variables**:

| Nomi | Qiymati |
|---|---|
| `DATABASE_URL` | pooler ulanish satri (percent-encode qilingan parol bilan) |

Boshqa env kerak emas — admin hisobi bazada turadi.

## Admin panel — `/admin`

- Yuqorida: xodimlar soni, tasdiqlangan / tasdiqlanmagan / kutilmoqda / izohlar sanog'i
- Chapda: xodimlar ro'yxati — har birida tasdiq/rad nisbati va oxirgi faollik
- O'ngda: javoblar **bo'limlar bo'yicha guruhlangan**, izohlar sariq blokda,
  har qatorda kim yozgani va sanasi
- Qidiruv: ism, bosqich nomi yoki izoh matni bo'yicha
- Filtrlar: faqat izohlilar · tasdiqlanmagan · tasdiqlangan · kutilmoqda
- **CSV yuklab olish** — ekrandagi filtrlangan ro'yxat Excel uchun

To'g'ridan-to'g'ri API (admin sessiyasi bilan):
`GET /api/hisobot` (yig'ma) · `GET /api/hisobot?toliq=1` (barcha javoblar).
Yoki Supabase → Table Editor → `v_hisobot` / `v_javoblar`.

## Foydali SQL

```sql
-- Kim qaysi bo'limga nima yozgan
select ism_familiya, bolim_nomi, bosqich_raqami, holat, izoh, yangilangan
  from public.v_javoblar where btrim(izoh) <> '' order by yangilangan desc;

-- Xodimni vaqtincha to'xtatish
update public.foydalanuvchilar set faol = false where nom_kalit = lower('Ism Familiya');

-- Barcha sessiyalarni uzish (hamma qaytadan kiradi)
delete from public.sessiyalar;
```
