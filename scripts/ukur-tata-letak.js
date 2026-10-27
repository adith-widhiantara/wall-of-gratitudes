'use strict';

// Mengukur tata letak papan dari pesan approved di DATA_DIR. Memakai paginasLayout yang sama dengan browser,
// tanpa kotak QR (QR bisa mengubah sedikit hasilnya). Pemakaian: DATA_DIR=./data node scripts/ukur-tata-letak.js

const path = require('node:path');
const Database = require('better-sqlite3');
const L = require('../public/wall-logika.js');

const DATA_DIR = process.env.DATA_DIR || './data';
const db = new Database(path.join(DATA_DIR, 'gratitude.db'), { readonly: true });
const pesan = db
  .prepare("SELECT id, name, message, color, created_at FROM messages WHERE status = 'approved' ORDER BY created_at DESC, id DESC")
  .all();
db.close();

const halaman = L.paginasLayout(pesan, []);
const kartu = halaman.flat();
const { cellW } = L.kisiGrid();
const rata = (a) => a.reduce((x, y) => x + y, 0) / a.length;

let pelanggaranTeks = 0;
let keluarKanvas = 0;
halaman.forEach((pg) => {
  const geo = pg.map((pl) => L.geometriKartu(pl, cellW));
  geo.forEach((g) => {
    if (g.kertas.some(([x, y]) => x < -1e-6 || y < -1e-6 || x > L.DESIGN_W + 1e-6 || y > L.DESIGN_H + 1e-6)) keluarKanvas += 1;
  });
  for (let i = 0; i < pg.length; i += 1) {
    for (let j = 0; j < pg.length; j += 1) {
      if (i !== j && L.bertabrakan(geo[i].teks, geo[j].kertas)) pelanggaranTeks += 1;
    }
  }
});

console.log(`Pesan approved: ${pesan.length}. Halaman: ${halaman.length}. Kartu per halaman rata-rata: ${(kartu.length / halaman.length).toFixed(1)}.`);
console.log(`Kemiringan rata-rata: ${rata(kartu.map((p) => Math.abs(p.rot))).toFixed(2)} derajat (maksimum ${Math.max(...kartu.map((p) => Math.abs(p.rot))).toFixed(2)}).`);
console.log(`Geseran rata-rata: ${rata(kartu.map((p) => Math.hypot(p.dx, p.dy))).toFixed(1)} px (sumbu x saja ${rata(kartu.map((p) => Math.abs(p.dx))).toFixed(1)} px).`);
console.log(`Kartu yang geserannya dipangkas: ${((100 * kartu.filter((p) => p.k < 1).length) / kartu.length).toFixed(1)}%.`);
console.log(`Pelanggaran teks tertutup: ${pelanggaranTeks}. Kertas keluar kanvas: ${keluarKanvas}.`);
