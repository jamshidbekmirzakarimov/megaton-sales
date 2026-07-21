/* Autentifikatsiya: parol hash (scrypt), sessiya cookie, guard'lar, rate limit.
   Yangi paket yo'q — faqat node:crypto. */
import { randomBytes, scrypt as _scrypt, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { q, json } from './_db.js';

const scrypt = promisify(_scrypt);

/* ---------- Parol ----------
   Format:  scrypt$<N>$<r>$<p>$<salt_b64url>$<hash_b64url>
   N=16384, r=8, p=1, salt 16 bayt, keylen 64 */
const N = 16384, R = 8, P = 1, SALT_LEN = 16, KEY_LEN = 64;

export async function parolHash(parol) {
  const salt = randomBytes(SALT_LEN);
  const hash = await scrypt(String(parol), salt, KEY_LEN, { N, r: R, p: P });
  return `scrypt$${N}$${R}$${P}$${salt.toString('base64url')}$${hash.toString('base64url')}`;
}

/* Hech qachon throw qilmaydi: noto'g'ri format ham → false */
export async function parolTekshir(parol, saqlangan) {
  try {
    if (typeof parol !== 'string' || typeof saqlangan !== 'string') return false;
    const qism = saqlangan.split('$');
    if (qism.length !== 6 || qism[0] !== 'scrypt') return false;
    const n = Number(qism[1]), r = Number(qism[2]), p = Number(qism[3]);
    // aqlli chegaralar — buzuq hash bilan xotirani yeb qo'ymaslik uchun
    if (!Number.isInteger(n) || n < 2 || n > 1 << 20) return false;
    if (!Number.isInteger(r) || r < 1 || r > 32) return false;
    if (!Number.isInteger(p) || p < 1 || p > 16) return false;
    const salt = Buffer.from(qism[4], 'base64url');
    const kutilgan = Buffer.from(qism[5], 'base64url');
    if (!salt.length || !kutilgan.length) return false;
    const hosil = await scrypt(parol, salt, kutilgan.length, { N: n, r, p, maxmem: 256 * 1024 * 1024 });
    if (hosil.length !== kutilgan.length) return false;
    return timingSafeEqual(hosil, kutilgan);
  } catch (e) {
    return false;   // parol/token log qilinmaydi
  }
}

/* ---------- Token ---------- */
export function tokenYarat() {
  return randomBytes(32).toString('base64url');
}

export function tokenHash(token) {
  return createHash('sha256').update(String(token)).digest('hex');
}

/* ---------- Cookie ---------- */
const COOKIE = 'mg_sess';
const MUDDAT = 2592000;              // 30 kun, sekundda

function ip(req) {
  const h = req.headers?.['x-forwarded-for'];
  return (typeof h === 'string' ? h.split(',')[0]?.trim() : '') || 'local';
}

function xavfsizmi(req) {
  if (process.env.VERCEL) return true;
  return req?.headers?.['x-forwarded-proto'] === 'https';
}

/* Bir nechta Set-Cookie'ni ustma-ust yozib yubormaslik uchun */
function setCookie(res, qiymat) {
  const bor = res.getHeader ? res.getHeader('Set-Cookie') : null;
  const royxat = bor ? (Array.isArray(bor) ? bor.slice() : [bor]) : [];
  royxat.push(qiymat);
  res.setHeader('Set-Cookie', royxat);
}

export function cookieQoy(res, token, req) {
  let c = `${COOKIE}=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${MUDDAT}`;
  if (xavfsizmi(req)) c += '; Secure';
  setCookie(res, c);
}

export function cookieOchir(res, req) {
  let c = `${COOKIE}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`;
  if (xavfsizmi(req)) c += '; Secure';
  setCookie(res, c);
}

/* Vercel `req.cookies` beradi, dev.mjs bermaydi — ikkalasi ham */
function cookieOl(req) {
  if (req?.cookies && typeof req.cookies === 'object' && req.cookies[COOKIE]) {
    return String(req.cookies[COOKIE]);
  }
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

/* ---------- Sessiya ---------- */
export async function sessiyaOch(res, foydalanuvchi_id, req) {
  const token = tokenYarat();
  await q(
    `insert into sessiyalar (foydalanuvchi_id, token_hash, amal_qiladi, ip, agent)
     values ($1, $2, now() + ($3 * interval '1 second'), $4, $5)`,
    [foydalanuvchi_id, tokenHash(token), MUDDAT, ip(req), String(req?.headers?.['user-agent'] || '').slice(0, 300)]
  );
  cookieQoy(res, token, req);
  return token;
}

export async function sessiyaOl(req) {
  const token = cookieOl(req);
  if (!token) return null;

  let r;
  try {
    r = await q(
      `select f.id, f.ism_familiya, f.username, f.rol, f.faol, s.id as sessiya_id
         from sessiyalar s
         join foydalanuvchilar f on f.id = s.foydalanuvchi_id
        where s.token_hash = $1
          and s.amal_qiladi > now()
          and f.faol = true
        limit 1`,
      [tokenHash(token)]
    );
  } catch (e) {
    console.error('sessiyaOl:', e.message);
    return null;
  }

  // Muddati o'tganlarni har so'rovda emas, ~20 so'rovda bir marta tozalaymiz
  if (Math.random() < 0.05) {
    q(`delete from sessiyalar where amal_qiladi < now()`)
      .catch(e => console.error('sessiya tozalash:', e.message));
  }

  return r[0] || null;
}

/* Sliding muddat: GET /api/men da sessiya yana 30 kunga uzayadi va cookie qayta qo'yiladi.
   Token faqat shu modulda ochiladi, shuning uchun uzaytirish ham shu yerda. */
export async function sessiyaUzaytir(req, res) {
  const token = cookieOl(req);
  if (!token) return false;
  try {
    const r = await q(
      `update sessiyalar set amal_qiladi = now() + ($2 * interval '1 second')
        where token_hash = $1 and amal_qiladi > now()
        returning id`,
      [tokenHash(token), MUDDAT]
    );
    if (!r.length) return false;
  } catch (e) {
    console.error('sessiyaUzaytir:', e.message);
    return false;
  }
  cookieQoy(res, token, req);
  return true;
}

export async function sessiyaYop(req, res) {
  const token = cookieOl(req);
  if (token) {
    try {
      await q(`delete from sessiyalar where token_hash = $1`, [tokenHash(token)]);
    } catch (e) {
      console.error('sessiyaYop:', e.message);
    }
  }
  cookieOchir(res, req);
}

/* ---------- Guard'lar ----------
   Ruxsat bo'lmasa javobni O'ZI yozadi va null qaytaradi.
   Chaqiruvchi:  const u = await talab(req,res); if(!u) return; */
export async function talab(req, res) {
  const u = await sessiyaOl(req);
  if (!u) { json(res, 401, { xato: 'Avval tizimga kiring' }); return null; }
  return u;
}

export async function talabAdmin(req, res) {
  const u = await sessiyaOl(req);
  if (!u) { json(res, 401, { xato: 'Avval tizimga kiring' }); return null; }
  if (u.rol !== 'admin') { json(res, 403, { xato: 'Faqat admin uchun' }); return null; }
  return u;
}

/* ---------- Login urinishlarini cheklash ----------
   In-memory, instansiya doirasida: 15 daqiqada 10 urinish.
   Kalit = ip + ':' + username (chaqiruvchi tayyorlaydi). */
const OYNA = 15 * 60 * 1000;
const CHEK = 10;
const urinishlar = new Map();

function tozalaEskilar(hozir) {
  for (const [k, v] of urinishlar) {
    if (hozir - v.vaqt > OYNA) urinishlar.delete(k);
  }
}

export function urinishTekshir(kalit) {
  const hozir = Date.now();
  const v = urinishlar.get(String(kalit));
  if (!v) return true;
  if (hozir - v.vaqt > OYNA) { urinishlar.delete(String(kalit)); return true; }
  return v.n < CHEK;
}

export function urinishQayd(kalit) {
  const k = String(kalit);
  const hozir = Date.now();
  if (urinishlar.size > 5000) tozalaEskilar(hozir);   // xotira o'smasin
  const v = urinishlar.get(k);
  if (!v || hozir - v.vaqt > OYNA) urinishlar.set(k, { n: 1, vaqt: hozir });
  else v.n += 1;
}

export function urinishTozala(kalit) {
  urinishlar.delete(String(kalit));
}

/* IP ni chaqiruvchi ham ishlatishi mumkin (rate-limit kaliti uchun) */
export { ip as soravIp };
