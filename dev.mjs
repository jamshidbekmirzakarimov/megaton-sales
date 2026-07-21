/* Lokal dev-server — Vercel funksiyalarini ishga tushiradi.
   Ishlatish:  npm run dev   →  http://localhost:3000
   Productionda bu fayl ishlatilmaydi (Vercel o'zi api/ ni yuritadi).

   Vercel'ning req/res obyektlari Node'ning IncomingMessage/ServerResponse
   ustiga qurilgan. Shuning uchun bu yerda faqat Vercel qo'shadigan
   qulayliklar shim qilinadi:
     - req.query          (URL search params)
     - res.status(code)   (chain qilinadi)
     - res.send(body)
   res.setHeader / res.getHeader / res.end / res.writeHead — native, shim KERAK EMAS.
   Bir nechta Set-Cookie ham ishlaydi: _auth.js getHeader bilan massivga qo'shadi,
   native ServerResponse massivni alohida qatorlarga yozadi (tekshirilgan).
   Cookie o'qish ham shim qilinmaydi: api/_auth.js req.headers.cookie ni o'zi ajratadi. */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;

const API = {
  '/api/kirish':       './api/kirish.js',        // xodim — ism bilan     (mg_sess)
  '/api/admin-kirish': './api/admin-kirish.js',  // admin — username+parol (mg_admin)
  '/api/chiqish':      './api/chiqish.js',       // {tur} — faqat o'shani yopadi
  '/api/men':          './api/men.js',           // xodim sessiyasi
  '/api/admin-men':    './api/admin-men.js',     // admin sessiyasi
  '/api/javoblar':     './api/javoblar.js',
  '/api/hisobot':      './api/hisobot.js',
};
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',   '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
};
/* vercel.json dagi rewrite'lar bilan bir xil */
const REWRITE = { '/': '/index.html', '/admin': '/admin.html' };

http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://localhost');

  if (u.pathname.startsWith('/api/')) {
    const fayl = API[u.pathname];
    if (!fayl) {
      res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ xato: 'Bunday API yo\'li yo\'q' }));
      console.log(`${req.method} ${u.pathname} → 404`);
      return;
    }

    req.query = Object.fromEntries(u.searchParams);
    res.status = c => { res.statusCode = c; return res; };
    res.send = b => res.end(b);

    try {
      /* import ham try ichida: modulda sintaksis xatosi bo'lsa server yiqilmasin.
         DIQQAT: Windows'da import() ga "D:\..." ko'rinishidagi yo'l berib bo'lmaydi —
         "d:" protokol deb o'qiladi (ERR_UNSUPPORTED_ESM_URL_SCHEME). Shuning uchun
         pathToFileURL bilan file:// URL ga o'giramiz. */
      const mod = await import(pathToFileURL(path.join(ROOT, fayl)).href);
      await mod.default(req, res);
    } catch (e) {
      console.error(e);
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end(JSON.stringify({ xato: 'Server xatosi' }));
      } else {
        res.end();
      }
    }
    if (!res.writableEnded) res.end();          // handler javob yozmasa osilib qolmasin
    console.log(`${req.method} ${u.pathname} → ${res.statusCode}`);
    return;
  }

  const rel = REWRITE[u.pathname] || u.pathname;
  const fp = path.join(ROOT, path.normalize(rel).replace(/^(\.\.[/\\])+/, ''));

  /* Maxfiy fayllarni bermaymiz: .env.local, .git/, node_modules/ va h.k.
     Dev-server hamma interfeysda tinglaydi — baza paroli sirg'alib chiqmasin. */
  const bolaklar = path.relative(ROOT, fp).split(/[/\\]/);
  let yopiq = bolaklar.some(b => b.startsWith('.') || b === 'node_modules');

  /* Faqat brauzerga mo'ljallangan turlar beriladi. Manba fayllar (.mjs, .js,
     .sql, .json, .md) va api/ papkasi — hech qachon. Vercel tomonda buni
     .vercelignore bajaradi; bu yerda esa shu ro'yxat. */
  const RUXSAT = new Set(['.html', '.css', '.svg', '.png', '.ico', '.jpg', '.jpeg', '.webp', '.woff2']);
  if (!RUXSAT.has(path.extname(fp).toLowerCase())) yopiq = true;
  if (bolaklar[0] === 'api') yopiq = true;

  /* ROOT + path.sep — "megaton-sales-maxfiy" kabi yonma-yon papka ilinib qolmasin */
  const ichkarida = fp === ROOT || fp.startsWith(ROOT + path.sep);

  if (!ichkarida || yopiq || !fs.existsSync(fp) || !fs.statSync(fp).isFile()) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('404 — topilmadi');
  }
  res.writeHead(200, {
    'Content-Type': MIME[path.extname(fp)] || 'application/octet-stream',
    'Cache-Control': 'no-store',                // dev: brauzer eski HTML'ni ushlab qolmasin
  });
  fs.createReadStream(fp).pipe(res);
}).listen(PORT, () => {
  console.log(`\n  Xodimlar sahifasi : http://localhost:${PORT}/`);
  console.log(`  Admin panel       : http://localhost:${PORT}/admin`);
  console.log(`  DB                : ${process.env.DATABASE_URL ? 'env orqali' : 'api/_db.js ichida (env kerak emas)'}`);
  console.log(`  Xodim kirishi     : faqat ism-familiya (parolsiz)`);
  console.log(`  Admin kirishi     : username "admin" / parol "admin"\n`);
});
