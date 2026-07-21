/* GET /api/men — XODIM sessiyasi (mg_sess cookie).
   Sessiya yo'q → 401. Bor → foydalanuvchi + javoblari.
   Muddat sliding: har so'rovda yana 30 kunga uzayadi.

   Admin paneli buni EMAS, /api/admin-men ni chaqiradi — ikki sessiya mustaqil. */
import { q, json } from './_db.js';
import { talab, sessiyaUzaytir } from './_auth.js';

async function javoblarniOl(foydalanuvchi_id) {
  return q(
    `select bolim, bosqich_raqami, bosqich_nomi, holat, izoh
       from public.javoblar
      where foydalanuvchi_id = $1
      order by bolim, bosqich_raqami`,
    [foydalanuvchi_id]
  );
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return json(res, 405, { xato: 'faqat GET' });

  /* Guard 401 javobini o'zi yozadi */
  const u = await talab(req, res);
  if (!u) return;

  try {
    await sessiyaUzaytir(req, res, 'xodim');
    const javoblar = await javoblarniOl(u.id);

    return json(res, 200, {
      foydalanuvchi: {
        id: u.id,
        ism_familiya: u.ism_familiya,
        rol: u.rol,
      },
      javoblar,
    });
  } catch (e) {
    console.error('men', e);
    return json(res, 500, { xato: 'Bazaga ulanishda xatolik' });
  }
}
