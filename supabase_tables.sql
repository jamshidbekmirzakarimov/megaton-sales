-- ============================================================
-- MEGATON — Supabase baza sxemasi
-- Supabase → SQL Editor → hammasini nusxalab → RUN
--
-- Kirish modeli:
--   XODIM  — faqat ism-familiya yozadi, parol YO'Q (nom_kalit bo'yicha topiladi/yaratiladi)
--   ADMIN  — username + parol bilan kiradi (pastda tayyor qo'shiladi: admin / admin)
--
-- DIQQAT: bu fayl eski jadvallarni O'CHIRADI va qaytadan yaratadi.
-- ============================================================

create extension if not exists pgcrypto;   -- gen_random_uuid() uchun

-- ------------------------------------------------------------
-- 0) ESKI OBYEKTLARNI O'CHIRISH (idempotent)
-- ------------------------------------------------------------
drop view     if exists public.v_hisobot;
drop view     if exists public.v_javoblar;
drop table    if exists public.javoblar         cascade;
drop table    if exists public.sessiyalar       cascade;
drop table    if exists public.foydalanuvchilar cascade;
drop table    if exists public.bolimlar         cascade;
drop function if exists public.kirish(text);


-- ------------------------------------------------------------
-- 1) FOYDALANUVCHILAR — xodimlar va adminlar bitta jadvalda
--    Xodimda:  nom_kalit to'ldirilgan, username/parol_hash = null
--    Adminda:  username_kalit + parol_hash to'ldirilgan, nom_kalit = null
-- ------------------------------------------------------------
create table public.foydalanuvchilar (
  id              uuid primary key default gen_random_uuid(),
  ism_familiya    text not null,

  nom_kalit       text unique,           -- lower(ism_familiya) — XODIM uchun
  username        text,                  -- ADMIN uchun
  username_kalit  text unique,           -- lower(username)
  parol_hash      text,                  -- scrypt$N$r$p$salt$hash — ochiq parol saqlanmaydi

  rol             text not null default 'xodim' check (rol in ('xodim','admin')),
  faol            boolean not null default true,

  birinchi_kirish timestamptz not null default now(),
  oxirgi_kirish   timestamptz,
  yangilangan     timestamptz not null default now(),

  -- Har bir qatorda ishlaydigan kirish usuli bo'lishi shart
  constraint kirish_usuli check (
    (rol = 'admin' and username_kalit is not null and parol_hash is not null)
    or
    (rol = 'xodim' and nom_kalit is not null)
  )
);

-- Eslatma: Postgres'da unique ustun bir nechta NULL ni qabul qiladi,
-- shuning uchun hamma xodimda username_kalit = null bo'lishi muammo emas.


-- ------------------------------------------------------------
-- 2) SESSIYALAR — cookie'dagi token faqat sha256 XESH holida saqlanadi
--
--    IKKI MUSTAQIL SESSIYA: bir brauzerda xodim ham, admin ham
--    bir vaqtda turishi mumkin. Ular alohida cookie'da yotadi:
--      tur='xodim' -> mg_sess   (/ sahifasi)
--      tur='admin' -> mg_admin  (/admin sahifasi)
--    `tur` ustuni SQL darajasida ham tekshiriladi, shuning uchun
--    xodim tokenini admin slotiga ko'chirib qo'yish ish bermaydi.
-- ------------------------------------------------------------
create table public.sessiyalar (
  id               uuid primary key default gen_random_uuid(),
  foydalanuvchi_id uuid not null references public.foydalanuvchilar(id) on delete cascade,
  token_hash       text not null unique,
  tur              text not null default 'xodim' check (tur in ('xodim','admin')),
  yaratilgan       timestamptz not null default now(),
  amal_qiladi      timestamptz not null,
  ip               text,
  agent            text
);
create index sessiyalar_user_idx   on public.sessiyalar (foydalanuvchi_id);
create index sessiyalar_muddat_idx on public.sessiyalar (amal_qiladi);
create index sessiyalar_tur_idx    on public.sessiyalar (tur);


-- ------------------------------------------------------------
-- 3) BOLIMLAR — 5 ta savdo yo'nalishi
-- ------------------------------------------------------------
create table public.bolimlar (
  kod      text primary key,
  nomi     text not null,
  sarlavha text,
  rang     text,
  tartib   int not null default 0
);

insert into public.bolimlar (kod, nomi, sarlavha, rang, tartib) values
  ('umumiy','Umumiy','Umumiy jarayon',                   '#ef8a17',1),
  ('b2b',   'B2B',   'B2B — Obyekt asosida sotuv',       '#3b82f6',2),
  ('b2c',   'B2C',   'B2C — Lead va kanal asosida sotuv','#f5a623',3),
  ('b2g',   'B2G',   'B2G — Davlat / new.cooperation.uz','#16a34a',4),
  ('export','Export','Export — Kontrakt → Chegara (FCA)','#8b5cf6',5)
on conflict (kod) do nothing;


-- ------------------------------------------------------------
-- 4) JAVOBLAR — har bir bosqich uchun tasdiq/rad + izoh
-- ------------------------------------------------------------
create table public.javoblar (
  id               bigserial primary key,
  foydalanuvchi_id uuid not null references public.foydalanuvchilar(id) on delete cascade,
  bolim            text not null references public.bolimlar(kod),
  bosqich_raqami   int  not null,
  bosqich_nomi     text,
  holat            text not null default 'kutilmoqda'
                   check (holat in ('tasdiqlangan','tasdiqlanmagan','kutilmoqda')),
  izoh             text not null default '',
  yangilangan      timestamptz not null default now(),
  unique (foydalanuvchi_id, bolim, bosqich_raqami)   -- upsert kaliti
);
create index javoblar_user_idx  on public.javoblar (foydalanuvchi_id);
create index javoblar_bolim_idx on public.javoblar (bolim, holat);


-- ------------------------------------------------------------
-- 5) ADMIN HISOBI  —  username: admin    parol: admin
--    Parol scrypt bilan xeshlangan, ochiq holda saqlanmaydi.
--    Parolni keyin o'zgartirish:  npm run admin-parol -- "yangi-parol"
-- ------------------------------------------------------------
insert into public.foydalanuvchilar (ism_familiya, username, username_kalit, parol_hash, rol)
values (
  'Administrator', 'admin', 'admin',
  'scrypt$16384$8$1$LaZnuza_aoWL2eKhfEFuyw$jAyr7OxplIjyqFKkky44Na28DIlxiB02-sX21c-ulB4i3Ifpza8mwvyKTZRmKjnNdkWR3MuCdCF8G57EfPg0DA',
  'admin'
)
on conflict (username_kalit) do nothing;


-- ------------------------------------------------------------
-- 6) HISOBOT UCHUN VIEW'LAR — admin panel shulardan o'qiydi
-- ------------------------------------------------------------
create or replace view public.v_javoblar with (security_invoker = true) as
select f.ism_familiya,
       f.username,
       f.rol,
       j.foydalanuvchi_id,
       b.nomi as bolim_nomi,
       j.bolim,
       j.bosqich_raqami,
       j.bosqich_nomi,
       j.holat,
       j.izoh,
       j.yangilangan
from public.javoblar j
join public.foydalanuvchilar f on f.id  = j.foydalanuvchi_id
join public.bolimlar b         on b.kod = j.bolim;

create or replace view public.v_hisobot with (security_invoker = true) as
select f.id as foydalanuvchi_id,
       f.ism_familiya,
       f.username,
       j.bolim,
       b.nomi as bolim_nomi,
       count(*) filter (where j.holat = 'tasdiqlangan')   as tasdiqlangan,
       count(*) filter (where j.holat = 'tasdiqlanmagan') as tasdiqlanmagan,
       count(*) filter (where j.holat = 'kutilmoqda')     as kutilmoqda,
       count(*) filter (where length(btrim(j.izoh)) > 0)  as izohlar,
       max(j.yangilangan)                                 as oxirgi_faollik
from public.javoblar j
join public.foydalanuvchilar f on f.id  = j.foydalanuvchi_id
join public.bolimlar b         on b.kod = j.bolim
group by f.id, f.ism_familiya, f.username, j.bolim, b.nomi, b.tartib
order by f.ism_familiya, b.tartib;


-- ------------------------------------------------------------
-- 7) XAVFSIZLIK — anon uchun hammasi yopiq
--    Bazaga faqat server (DATABASE_URL, postgres roli) kiradi, u RLS'ni chetlab o'tadi.
--    Supabase anon kaliti bilan PostgREST orqali hech narsa ko'rinmasligi kerak.
-- ------------------------------------------------------------
alter table public.foydalanuvchilar enable row level security;
alter table public.sessiyalar       enable row level security;
alter table public.javoblar         enable row level security;
alter table public.bolimlar         enable row level security;
-- Ataylab hech qanday policy yaratilmaydi → anon/authenticated uchun hammasi yopiq.

revoke all on all tables    in schema public from anon, authenticated;
revoke all on all functions in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on schema public                 from anon, authenticated;

alter default privileges in schema public revoke all on tables    from anon, authenticated;
alter default privileges in schema public revoke all on functions from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;


-- ============================================================
-- FOYDALI SO'ROVLAR
-- ============================================================
-- Kim qaysi bo'limga nima yozgani:
--   select ism_familiya, bolim_nomi, bosqich_raqami, holat, izoh, yangilangan
--     from public.v_javoblar where btrim(izoh) <> '' order by yangilangan desc;
--
-- Xodimni vaqtincha to'xtatish:
--   update public.foydalanuvchilar set faol = false where nom_kalit = lower('Ism Familiya');
--
-- Adashib yaratilgan xodimni o'chirish (javoblari ham cascade bilan ketadi):
--   delete from public.foydalanuvchilar where nom_kalit = lower('Ism Familiya');
