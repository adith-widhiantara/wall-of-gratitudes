'use strict';

// Simulasi waktu layar per halaman di /wall. Memakai logika yang sama dengan browser:
// paginasLayout, jadwalSelingan, dan halamanTampil dari public/wall-logika.js.
// Pemakaian: node scripts/sim-rotasi.js [pesanAwal] [detik] [intervalPesanBaru] [jedaRotasiDetik]

const L = require('../public/wall-logika.js');

const [, , awalArg, detikArg, intervalArg, rotasiArg] = process.argv;
const PESAN_AWAL = Number(awalArg) || 200;
const DETIK = Number(detikArg) || 1200;
const INTERVAL_BARU = Number(intervalArg) || 10;
const JEDA_ROTASI_MS = (Number(rotasiArg) || 15) * 1000;
const T0 = 1_700_000_000_000;

function pesan(id) {
  const panjang = 3 + Math.floor(L.seed(id, 7) * 278); // 3 sampai 280 huruf
  return { id, name: null, message: 'a'.repeat(panjang), color: 'kuning', created_at: T0 + id };
}

const messages = [];
for (let i = 1; i <= PESAN_AWAL; i += 1) messages.push(pesan(i));
let nextId = PESAN_AWAL;
let pages = L.paginasLayout(messages);
const halamanAwal = pages.length;

let rot = L.rotasiAwal(T0, JEDA_ROTASI_MS);
let sel = { terakhir: null };
let antrean = [];
let terbaru = null;
let detour = null;
let selingan = 0;
const detik = [];

for (let t = 0; t < DETIK; t += 1) {
  const now = T0 + t * 1000;
  if (t > 0 && t % INTERVAL_BARU === 0) {
    nextId += 1;
    const m = pesan(nextId);
    messages.push(m);
    antrean.push(m.id);
    terbaru = m.id;
    pages = L.paginasLayout(messages);
  }
  if (detour && now >= detour.sampai) detour = null;
  if (antrean.length > 0) {
    const r = L.jadwalSelingan(sel, now, antrean, terbaru);
    sel = r.sel;
    if (r.mulai) {
      const p = pages.findIndex((pg) => pg.some((pl) => pl.m.id === terbaru));
      detour = { halaman: Math.max(0, p), sampai: now + L.DETOUR_MS };
      antrean = [];
      terbaru = null;
      selingan += 1;
    }
  }
  detik.push(L.halamanTampil(now, L.jumlahHalaman(pages), detour, rot));
}

const jumlahAkhir = pages.length;
const hitung = new Array(jumlahAkhir).fill(0);
for (const p of detik) hitung[p] += 1;

const total = DETIK;
console.log(`Pesan awal ${PESAN_AWAL}, akhir ${messages.length}. Halaman awal ${halamanAwal}, akhir ${jumlahAkhir}.`);
console.log(`Pesan baru tiap ${INTERVAL_BARU} detik, rotasi ${JEDA_ROTASI_MS / 1000} detik, durasi ${DETIK} detik.`);
console.log(`Selingan terjadi ${selingan} kali.\n`);
console.log('| Halaman | Waktu layar (detik) | Persen |');
console.log('|---:|---:|---:|');
let maks = { p: -1, persen: -1 };
let min = { p: -1, detik: Infinity };
hitung.forEach((d, p) => {
  const persen = (100 * d) / total;
  if (persen > maks.persen) maks = { p, persen };
  if (d < min.detik) min = { p, detik: d };
  console.log(`| ${p + 1} | ${d} | ${persen.toFixed(1)}% |`);
});
console.log(`\nHalaman terlama: ${maks.p + 1} (${maks.persen.toFixed(1)}%). Terpendek: ${min.p + 1} (${min.detik} detik).`);
