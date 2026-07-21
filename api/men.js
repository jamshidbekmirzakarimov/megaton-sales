/* GET /api/men
   Sessiya yo'q → 401. Bor → foydalanuvchi + javoblari,
   sessiya muddati uzaytiriladi (sliding) va cookie qayta qo'yiladi. */
import { q, json } from './_db.js';
import { talab } from './_auth.js';

/* Cookie shartnomasi — SPEC 1-bo'lim */
const COOKIE = 'mg_sess';
const MUDDAT = 2592000;          // 30 kun, sekundda

/* Shu so'rov kirish.js da ham bor — ataylab takrorlangan */
async function javoblarniOl(foydalanuvchi_id) {
  return q(
    `select bolim, bosqich_raqami, bosqich_nomi, holat, izoh
       from public.javoblar
      where foydalanuvchi_id = $1
      order by bolim, bosqich_raqami`,
    [foydalanuvchi_id]
  );
}

/* Vercel `req.cookies` beradi, dev.mjs bermaydi — ikkalasi ham qo'llab-quvvatlanadi */
function tokenOl(req) {
  if (req?.cookies && typeof req.cookies === 'object' && req.cookies[COOKIE])
    return String(req.cookies[COOKIE]);
  const xom = req?.headers?.cookie;
  if (typeof xom !== 'string') return null;
  for (const bolak of xom.split(';')) {
    const t = bolak.indexOf('=');
    if (t < 0) continue;
    if (bolak.slice(0, t).trim() !== COOKIE) continue;
    const v = bolak.slice(t + 1).trim();
    if (!v) return null;
    try { return decodeURIComponent(v); } catch { return v; }
  }
  return null;
}

/* Localhost'da Secure BO'LMASIN — aks holda brauzer cookie'ni qabul qilmaydi */
function cookieQaytaQoy(res, req, token) {
  let c = `${COOKIE}=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${MUDDAT}`;
  if (process.env.VERCEL || req?.headers?.['x-forwarded-proto'] === 'https') c += '; Secure';
  res.setHeader('Set-Cookie', c);
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return json(res, 405, { xato: 'faqat GET' });

  /* Guard 401 javobini o'zi yozadi */
  const u = await talab(req, res);
  if (!u) return;

  try {
    /* Sliding: har so'rovda muddat yana 30 kunga uzayadi */
    await q(
      `update public.sessiyalar
          set amal_qiladi = now() + ($2::int * interval '1 second')
        where id = $1`,
      [u.sessiya_id, MUDDAT]
    );

    const token = tokenOl(req);
    if (token) cookieQaytaQoy(res, req, token);

    const javoblar = await javoblarniOl(u.id);

    return json(res, 200, {
      foydalanuvchi: {
        id: u.id,
        ism_familiya: u.ism_familiya,
        username: u.username,
        rol: u.rol,
      },
      javoblar,
    });
  } catch (e) {
    console.error('men', e);
    return json(res, 500, { xato: 'Bazaga ulanishda xatolik' });
  }
}
