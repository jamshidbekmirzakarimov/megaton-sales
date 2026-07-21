/* POST /api/chiqish  { tur: 'xodim' | 'admin' }
   FAQAT ko'rsatilgan turdagi sessiyani yopadi — ikkinchisi tegilmaydi.
   Ya'ni admin panelidan chiqish xodim sessiyasini uzmaydi va aksincha.

   tur berilmasa 'xodim' deb hisoblanadi (xodim sahifasi eski mijozlari uchun).
   Idempotent: sessiya bo'lmasa ham 200 { ok:true } */
import { json, readBody } from './_db.js';
import { sessiyaYop, cookieOchir } from './_auth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { xato: 'faqat POST' });

  /* tur body'dan yoki ?tur= dan; noto'g'ri qiymat → 'xodim' */
  const body = await readBody(req);
  const xom = body?.tur ?? req.query?.tur;
  const tur = xom === 'admin' ? 'admin' : 'xodim';

  try {
    await sessiyaYop(req, res, tur);
  } catch (e) {
    /* Baza javob bermasa ham brauzerdagi cookie o'chirilsin — chiqish to'xtamasin */
    console.error('chiqish', e);
    cookieOchir(res, req, tur);
  }

  return json(res, 200, { ok: true, tur });
}
