/* POST /api/chiqish
   Sessiyani bazadan o'chiradi + cookie'ni tozalaydi.
   Idempotent: sessiya bo'lmasa ham 200 { ok:true } */
import { json } from './_db.js';
import { sessiyaYop, cookieOchir } from './_auth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { xato: 'faqat POST' });

  try {
    await sessiyaYop(req, res);
  } catch (e) {
    /* Baza javob bermasa ham brauzerdagi cookie o'chirilsin — chiqish to'xtamasin */
    console.error('chiqish', e);
    cookieOchir(res, req);
  }

  return json(res, 200, { ok: true });
}
