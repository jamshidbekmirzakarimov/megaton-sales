/* Umumiy DB ulanishi — Supabase transaction pooler (port 6543).
   Serverless funksiyalar orasida pool qayta ishlatiladi. */
import pg from 'pg';

/* ============================================================
   BAZA ULANISHI — ataylab shu yerda, kod ichida.
   Env o'zgaruvchisi kerak emas: `vercel --prod` hech qanday sozlamasiz ishlaydi.

   ⚠️  BU YERDA BAZA PAROLI TURIBDI.
   1) Bu faylni HECH QACHON ochiq (public) GitHub omboriga yuklamang.
      Botlar Postgres ulanish satrlarini bir necha soat ichida topadi.
      Ombor yaratsangiz — Private qiling.
   2) Bu fayl `api/` papkasida turishi SHART. Vercel `api/` ni serverless
      funksiya sifatida yuritadi va uning manbasini brauzerga bermaydi.
      Ildizdagi fayllar (dev.mjs, *.sql, *.md) esa statik tarqatiladi —
      parolni u yerga ko'chirmang. Qo'shimcha himoya: `.vercelignore`.
   3) Parol o'zgarsa — faqat shu qatorni tahrirlang.
      Parolda # / + @ ? bo'lsa percent-encode qiling: # → %23, / → %2F, + → %2B

   Xohlasangiz DATABASE_URL env'ini qo'ysangiz — u ustun turadi.
   ============================================================ */
const DB_URL =
  process.env.DATABASE_URL ||
  'postgresql://postgres.volfghmqdwrkgxyncpzh:%237%2Fw%2BYF*GNsSkn5@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres';

const g = globalThis;

export const pool =
  g.__mgPool ||
  (g.__mgPool = new pg.Pool({
    connectionString: DB_URL,
    ssl: { rejectUnauthorized: false },
    max: 3,                       // serverless: har bir instansiya kam ulanish oladi
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
  }));

export async function q(text, params) {
  const r = await pool.query(text, params);
  return r.rows;
}

export function json(res, code, body) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.status(code).send(JSON.stringify(body));
}

/* Body hajmi chegarasi — 1 MB dan oshsa o'qimaymiz (DoS yuzasi) */
const MAX_BODY = 1024 * 1024;

/* Body har doim ham parse bo'lmaydi (sendBeacon → Blob) */
export async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') {
    if (Buffer.byteLength(req.body, 'utf8') > MAX_BODY) return null;
    try { return JSON.parse(req.body); } catch { return null; }
  }
  const chunks = [];
  let hajm = 0;
  for await (const c of req) {
    const b = Buffer.isBuffer(c) ? c : Buffer.from(c);
    hajm += b.length;
    if (hajm > MAX_BODY) return null;   // juda katta — o'qishni to'xtatamiz
    chunks.push(b);
  }
  if (!chunks.length) return null;
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return null; }
}

export const BOLIMLAR = ['umumiy', 'b2b', 'b2c', 'b2g', 'export'];
export const HOLATLAR = ['tasdiqlangan', 'tasdiqlanmagan', 'kutilmoqda'];
export const ROLLAR = ['xodim', 'admin'];
