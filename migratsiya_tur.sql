-- ============================================================
-- MIGRATSIYA — sessiyalar.tur ustuni
-- Supabase → SQL Editor → nusxalab → RUN
--
-- Nima uchun: xodim (/) va admin (/admin) sessiyalari endi MUSTAQIL.
-- Ular alohida cookie'da yotadi (mg_sess va mg_admin) va sessiya qatorida
-- `tur` ustuni bilan belgilanadi. Shu sabab bitta brauzerda ikkalasi
-- bir vaqtda ochiq turaveradi va bir-birini bosmaydi.
--
-- Bu fayl HECH NARSANI O'CHIRMAYDI (faqat eski sessiyalarni uzadi —
-- ularning turi noma'lum, hamma qaytadan kiradi).
-- ============================================================

alter table public.sessiyalar
  add column if not exists tur text not null default 'xodim';

alter table public.sessiyalar
  drop constraint if exists sessiyalar_tur_check;

alter table public.sessiyalar
  add constraint sessiyalar_tur_check check (tur in ('xodim','admin'));

create index if not exists sessiyalar_tur_idx on public.sessiyalar (tur);

-- Eski sessiyalarning turi noma'lum — tozalaymiz, hamma qaytadan kiradi.
delete from public.sessiyalar;

-- Tekshirish:
select column_name, data_type, column_default
  from information_schema.columns
 where table_schema = 'public' and table_name = 'sessiyalar'
 order by ordinal_position;
