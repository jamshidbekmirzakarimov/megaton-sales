/* GET /api/admin-men — ADMIN sessiyasi (mg_admin cookie).
   Admin panel sahifa ochilganda shuni chaqiradi: sessiya bo'lsa darhol kiradi.
   Xodim sessiyasi (mg_sess) bu yerda ish bermaydi va tegilmaydi ham. */
import { json } from './_db.js';
import { talabAdmin, sessiyaUzaytir } from './_auth.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return json(res, 405, { xato: 'faqat GET' });

  /* Guard 401/403 javobini o'zi yozadi */
  const u = await talabAdmin(req, res);
  if (!u) return;

  try {
    await sessiyaUzaytir(req, res, 'admin');
    return json(res, 200, {
      foydalanuvchi: {
        id: u.id,
        ism_familiya: u.ism_familiya,
        username: u.username,
        rol: u.rol,
      },
    });
  } catch (e) {
    console.error('admin-men', e);
    return json(res, 500, { xato: 'Bazaga ulanishda xatolik' });
  }
}
