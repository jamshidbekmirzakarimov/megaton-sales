/* POST /api/kirish  { ism_familiya }
   Xodim kirishi — parol YO'Q. Ism bo'yicha topadi yoki yaratadi,
   sessiya ochadi (HttpOnly cookie) va oldingi javoblarini qaytaradi.
   → 200 { foydalanuvchi:{id,ism_familiya,rol}, javoblar:[...] } */
import { q, json, readBody } from './_db.js';
import { sessiyaOch } from './_auth.js';

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
  if (req.method !== 'POST') return json(res, 405, { xato: 'faqat POST' });

  const body = await readBody(req);
  /* Ichki ortiqcha bo'shliqlar bittaga tushiriladi — "Ali  Vali" va "Ali Vali" bir odam */
  const ism = String(body?.ism_familiya || '').replace(/\s+/g, ' ').trim();

  if (ism.length < 3)  return json(res, 400, { xato: 'Ism-familiya juda qisqa' });
  if (ism.length > 80) return json(res, 400, { xato: 'Ism-familiya juda uzun' });

  const kalit = ism.toLowerCase();

  try {
    /* Bor bo'lsa — oxirgi kirishni yangilaydi; yo'q bo'lsa — yaratadi.
       rol ustuni ataylab tegilmaydi: adminni xodimga tushirib yubormaslik uchun. */
    const [user] = await q(
      `insert into public.foydalanuvchilar (ism_familiya, nom_kalit, oxirgi_kirish)
            values ($1, $2, now())
       on conflict (nom_kalit) do update
              set oxirgi_kirish = now(),
                  yangilangan   = now(),
                  ism_familiya  = excluded.ism_familiya
        returning id, ism_familiya, rol, faol`,
      [ism, kalit]
    );

    if (!user.faol) return json(res, 403, { xato: "Hisobingiz to'xtatilgan" });

    await sessiyaOch(res, user.id, req);
    const javoblar = await javoblarniOl(user.id);

    return json(res, 200, {
      foydalanuvchi: { id: user.id, ism_familiya: user.ism_familiya, rol: user.rol },
      javoblar,
    });
  } catch (e) {
    console.error('kirish', e);
    return json(res, 500, { xato: 'Bazaga ulanishda xatolik' });
  }
}
