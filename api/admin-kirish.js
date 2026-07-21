/* POST /api/admin-kirish  { username, parol }
   Admin kirishi — username + parol. Xodimlarda parol_hash null bo'lgani uchun
   ular bu yerdan kira olmaydi (parolTekshir false qaytaradi).
   → 200 { foydalanuvchi:{id,ism_familiya,username,rol} } */
import { q, json, readBody } from './_db.js';
import {
  parolTekshir, sessiyaOch,
  urinishTekshir, urinishQayd, urinishTozala, soravIp,
} from './_auth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { xato: 'faqat POST' });

  const body = await readBody(req);
  const kalit = String(body?.username || '').trim().toLowerCase();
  const parol = String(body?.parol || '');

  /* Rate limit: 15 daqiqada 10 urinish. Parol oddiy bo'lgani uchun bu muhim. */
  const rl = soravIp(req) + ':' + kalit.slice(0, 64);
  if (!urinishTekshir(rl))
    return json(res, 429, { xato: "Juda ko'p urinish. 15 daqiqadan keyin qayta urining" });

  try {
    const [user] = await q(
      `select id, ism_familiya, username, rol, faol, parol_hash
         from public.foydalanuvchilar
        where username_kalit = $1
        limit 1`,
      [kalit]
    );

    /* Topilmadi yoki parol xato — BIR XIL xabar, qaysi biri ekani oshkor qilinmaydi */
    const togri = user ? await parolTekshir(parol, user.parol_hash) : false;
    if (!user || !togri) {
      urinishQayd(rl);
      return json(res, 401, { xato: "Username yoki parol noto'g'ri" });
    }

    if (!user.faol)          return json(res, 403, { xato: "Hisobingiz to'xtatilgan" });
    if (user.rol !== 'admin') return json(res, 403, { xato: 'Faqat admin uchun' });

    await q('update public.foydalanuvchilar set oxirgi_kirish = now() where id = $1', [user.id]);

    urinishTozala(rl);
    await sessiyaOch(res, user.id, req);

    return json(res, 200, {
      foydalanuvchi: {
        id: user.id,
        ism_familiya: user.ism_familiya,
        username: user.username,
        rol: user.rol,
      },
    });
  } catch (e) {
    console.error('admin-kirish', e);
    return json(res, 500, { xato: 'Bazaga ulanishda xatolik' });
  }
}
