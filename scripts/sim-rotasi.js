'use strict';

// Simulasi waktu layar per halaman di /wall. Memakai logika yang sama dengan browser:
// paginasLayout, jadwalSelingan, dan halamanTampil dari public/wall-logika.js.
// Pemakaian: node scripts/sim-rotasi.js [pesanAwal] [detik] [intervalPesanBaru] [jedaRotasiDetik]
//
// Kriteria (a): tidak ada halaman dengan lebih dari 15% waktu layar (skenario bertumbuh).
// Kriteria (b): tidak ada halaman dengan kurang dari 60% rata-rata waktu per halaman.
//   Diukur pada kondisi akhir yang dibekukan (tanpa pesan baru), karena halaman baru
//   yang muncul di tengah simulasi secara aritmetika mendapat lebih sedikit waktu.
// Kriteria (c): waktu satu putaran penuh dalam menit, pada kondisi awal dan akhir.

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

function hitungWaktu(pages, rot, detour0, detik, mulaiDetik = 0) {
  const hitung = new Array(pages.length).fill(0);
  let detour = detour0;
  for (let t = mulaiDetik; t < mulaiDetik + detik; t += 1) {
    const now = T0 + t * 1000;
    if (detour && now >= detour.sampai) detour = null;
    hitung[L.halamanTampil(now, L.jumlahHalaman(pages), detour, rot)] += 1;
  }
  return hitung;
}

// Skenario bertumbuh: pesan baru disetujui tiap INTERVAL_BARU detik.
const messages = [];
for (let i = 1; i <= PESAN_AWAL; i += 1) messages.push(pesan(i));
let nextId = PESAN_AWAL;
let pages = L.paginasLayout(messages, []);
const halamanAwal = pages.length;

const rot = L.rotasiAwal(T0, JEDA_ROTASI_MS);
let sel = { terakhir: null };
let antrean = [];
let terbaru = null;
let detour = null;
let selingan = 0;
const detik = new Array(pages.length).fill(0);
const hitungAwal = [...detik];
let jumlahAwal = pages.length;
const tumbuh = [];

for (let t = 0; t < DETIK; t += 1) {
  const now = T0 + t * 1000;
  if (t > 0 && t % INTERVAL_BARU === 0) {
    nextId += 1;
    const m = pesan(nextId);
    messages.push(m);
    antrean.push(m.id);
    terbaru = m.id;
    pages = L.paginasLayout(messages, []);
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
  const p = L.halamanTampil(now, L.jumlahHalaman(pages), detour, rot);
  while (detik.length < pages.length) detik.push(0);
  detik[p] += 1;
  tumbuh.push(pages.length);
  if (t === 0) jumlahAwal = pages.length;
}

const jumlahAkhir = pages.length;
const total = DETIK;
let maks = { p: -1, persen: -1 };
for (let p = 0; p < jumlahAkhir; p += 1) {
  const persen = (100 * (detik[p] || 0)) / total;
  if (persen > maks.persen) maks = { p, persen };
}

// (b): kondisi akhir dibekukan, dihitung selama DETIK detik.
const bekuRot = L.rotasiAwal(T0, JEDA_ROTASI_MS);
const bekuWaktu = hitungWaktu(pages, bekuRot, null, DETIK);
const rata = DETIK / jumlahAkhir;
const minBeku = Math.min(...bekuWaktu);
const sebagaiRasio = minBeku / rata;

// (c): satu putaran penuh = jumlah halaman x jeda rotasi.
const putaranAwalMenit = (halamanAwal * JEDA_ROTASI_MS) / 60000;
const putaranAkhirMenit = (jumlahAkhir * JEDA_ROTASI_MS) / 60000;

console.log(`Pesan awal ${PESAN_AWAL}, akhir ${messages.length}. Halaman awal ${halamanAwal}, akhir ${jumlahAkhir}.`);
console.log(`Pesan baru tiap ${INTERVAL_BARU} detik, rotasi ${JEDA_ROTASI_MS / 1000} detik, durasi ${DETIK} detik.`);
console.log(`Selingan terjadi ${selingan} kali.\n`);
console.log('Tabel waktu layar per halaman (skenario bertumbuh):\n');
console.log('| Halaman | Waktu layar (detik) | Persen |');
console.log('|---:|---:|---:|');
for (let p = 0; p < jumlahAkhir; p += 1) {
  const d = detik[p] || 0;
  console.log(`| ${p + 1} | ${d} | ${((100 * d) / total).toFixed(1)}% |`);
}
console.log('');
console.log(`(a) Halaman terlama: ${maks.p + 1} dengan ${maks.persen.toFixed(1)}%. Batas 15%: ${maks.persen <= 15 ? 'LULUS' : 'GAGAL'}.`);
console.log(`(b) Kondisi akhir dibekukan, rata-rata ${rata.toFixed(1)} detik per halaman. Terpendek ${minBeku} detik = ${(100 * sebagaiRasio).toFixed(0)}% rata-rata. Batas 60%: ${sebagaiRasio >= 0.6 ? 'LULUS' : 'GAGAL'}.`);
console.log(`(c) Satu putaran penuh: awal ${putaranAwalMenit.toFixed(1)} menit (${halamanAwal} halaman), akhir ${putaranAkhirMenit.toFixed(1)} menit (${jumlahAkhir} halaman). Batas 8 menit: ${putaranAkhirMenit <= 8 ? 'di dalam' : 'LEWAT'}.`);
