/* GET /api/hisobot          → odamlar ro'yxati + yig'ma hisobot
   GET /api/hisobot?toliq=1  → barcha javoblar va izohlar to'liq
   Faqat admin uchun — himoya rol asosida (talabAdmin). Kalit (key) YO'Q. */
import { q, json } from './_db.js';
import { talabAdmin } from './_auth.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return json(res, 405, { xato: 'faqat GET' });

  /* Guard javobni o'zi yozadi: 401 sessiya yo'q, 403 admin emas */
  const u = await talabAdmin(req, res);
  if (!u) return;

  try {
    if (req.query?.toliq) {
      const javoblar = await q(
        `select ism_familiya, username, foydalanuvchi_id, bolim_nomi, bolim,
                bosqich_raqami, bosqich_nomi, holat, izoh, yangilangan
           from public.v_javoblar
          order by ism_familiya, bolim, bosqich_raqami`);
      return json(res, 200, { javoblar });
    }

    const [odamlar, hisobot] = await Promise.all([
      q(`select id, ism_familiya, username, rol, faol,
                birinchi_kirish, oxirgi_kirish, yangilangan
           from public.foydalanuvchilar
          order by yangilangan desc`),
      q(`select * from public.v_hisobot`),
    ]);
    return json(res, 200, { jami_odam: odamlar.length, odamlar, hisobot });
  } catch (e) {
    console.error('hisobot', e);
    return json(res, 500, { xato: 'Bazaga ulanishda xatolik' });
  }
}
