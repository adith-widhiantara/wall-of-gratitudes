'use strict';

// Data uji untuk mencoba wall dan moderasi. Dipakai berulang, bukan sekali pakai.
//   node scripts/seed.js approved   : 200 pesan approved (menggantikan seed sebelumnya)
//   node scripts/seed.js pending    : 30 pesan pending (menggantikan seed pending sebelumnya)
//   node scripts/seed.js reset      : hapus semua pesan, dengan salinan database lebih dulu
// Pesan seed diberi ip_hash 'seed' supaya bisa dikenali dan diganti tanpa menyentuh pesan asli.

const path = require('node:path');
const { openDb, kosongkanSemua } = require('../src/db');

const DATA_DIR = process.env.DATA_DIR || './data';
const TANDA = 'seed';
const WARNA = ['kuning', 'mint', 'biru', 'peach', 'mawar', 'lavender'];
const NAMA = ['Sari', 'Budi', 'Dewi', 'Rama', 'Ayu', 'Agus', 'Nita', 'Yoga', 'Lestari', 'Hendra', 'Mega', 'Fajar'];
const KALIMAT = [
  'Terima kasih banyak atas kebersamaannya hari ini.',
  'Semoga kita selalu sehat dan bahagia bersama keluarga.',
  'Makasih untuk bantuan dan semangatnya sepanjang acara.',
  'Terima kasih sudah datang dan saling menyemangati.',
  'Senang bisa belajar banyak dari teman-teman di sini.',
  'Semoga kebaikan ini terus berlanjut di tempat kerja.',
  'Terima kasih panitia yang sudah bekerja keras.',
  'Alhamdulillah, hari yang menyenangkan dan penuh berkah.',
];
const ALIRAN = KALIMAT.join(' ') + ' ';

// Panjang merata dari 3 sampai 280 huruf (dibagi 200 langkah), jadi dua ujungnya selalu ada.
// Teksnya diambil dari aliran kalimat yang sama.
function pesan(id) {
  const idx = (id - 1) % 200;
  const panjang = 3 + Math.round((idx * 277) / 199);
  const teks = ALIRAN.repeat(4).slice(0, panjang);
  return teks.endsWith(' ') ? `${teks.slice(0, -1)}.` : teks;
}

function ambilSeed(db, status) {
  db.prepare('DELETE FROM messages WHERE ip_hash = ? AND status = ?').run(TANDA, status);
}

function sisipkan(db, daftar, status) {
  const ins = db.prepare(`
    INSERT INTO messages (name, message, color, status, created_at, ip_hash, device_hash)
    VALUES (?, ?, ?, ?, ?, ?, NULL)`);
  const awal = Date.now() - daftar.length * 60_000;
  db.transaction(() => {
    daftar.forEach((id, i) => {
      const nama = id % 3 === 0 ? null : NAMA[id % NAMA.length];
      ins.run(nama, pesan(id), WARNA[id % WARNA.length], status, awal + i * 60_000, TANDA);
    });
  })();
}

async function main() {
  const perintah = process.argv[2];
  const db = openDb(DATA_DIR);
  try {
    if (perintah === 'approved') {
      ambilSeed(db, 'approved');
      const ids = Array.from({ length: 200 }, (_, i) => i + 1);
      sisipkan(db, ids, 'approved');
      console.log(`200 pesan approved ditulis ke ${path.resolve(DATA_DIR, 'gratitude.db')}.`);
    } else if (perintah === 'pending') {
      ambilSeed(db, 'pending');
      const ids = Array.from({ length: 30 }, (_, i) => 1000 + i);
      sisipkan(db, ids, 'pending');
      console.log('30 pesan pending ditulis.');
    } else if (perintah === 'reset') {
      const hasil = await kosongkanSemua(db, DATA_DIR);
      console.log(`${hasil.jumlah} pesan dihapus. Salinan: ${path.resolve(DATA_DIR, hasil.backup)}`);
    } else {
      console.error('Pakai: node scripts/seed.js approved | pending | reset');
      process.exitCode = 1;
    }
  } finally {
    db.close();
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exitCode = 1;
});
