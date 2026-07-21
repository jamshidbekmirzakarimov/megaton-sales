/* Admin parolini o'zgartirish.
   Ishlatish:  npm run admin-parol -- "yangi-parol"
               npm run admin-parol -- "yangi-parol" boshqa_username

   Parol bazaga scrypt bilan xeshlab yoziladi, ochiq holda hech qayerda saqlanmaydi. */
import { parolHash } from './api/_auth.js';
import { q, pool } from './api/_db.js';

const parol    = process.argv[2];
const username = (process.argv[3] || 'admin').trim().toLowerCase();

if (!parol || parol.length < 4) {
  console.error('Ishlatish: npm run admin-parol -- "yangi-parol" [username]');
  console.error('Parol kamida 4 belgi bo\'lsin.');
  process.exit(1);
}
/* Baza ulanishi api/_db.js ichida — env kerak emas. */

try {
  const hash = await parolHash(parol);
  const r = await q(
    `update public.foydalanuvchilar
        set parol_hash = $2, yangilangan = now()
      where username_kalit = $1 and rol = 'admin'
      returning ism_familiya, username`,
    [username, hash]
  );

  if (!r.length) {
    console.error(`"${username}" nomli admin topilmadi.`);
    console.error('Mavjud adminlar:');
    const a = await q("select username from public.foydalanuvchilar where rol = 'admin'");
    a.forEach(x => console.error('  - ' + x.username));
    process.exit(1);
  }

  console.log(`Parol yangilandi: @${r[0].username} (${r[0].ism_familiya})`);
  console.log('Eski sessiyalar hali amal qiladi. Hammasini uzish uchun:');
  console.log('  delete from public.sessiyalar;');
} catch (e) {
  console.error('Xatolik:', e.message);
  process.exit(1);
} finally {
  await pool.end();
}
