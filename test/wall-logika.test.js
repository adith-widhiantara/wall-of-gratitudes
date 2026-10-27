'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  PAGE_SIZE,
  ROTATE_MS,
  DETOUR_MS,
  jumlahHalaman,
  halamanRotasi,
  halamanTampil,
  checksum,
} = require('../public/wall-logika.js');

test('jumlah halaman dihitung 12 per halaman, minimal 1', () => {
  assert.equal(jumlahHalaman(0), 1);
  assert.equal(jumlahHalaman(12), 1);
  assert.equal(jumlahHalaman(13), 2);
  assert.equal(jumlahHalaman(200), 17);
  assert.equal(PAGE_SIZE, 12);
});

test('checksum sama dengan format server: jumlah:jumlah id', () => {
  assert.equal(checksum([]), '0:0');
  assert.equal(checksum([{ id: 1 }, { id: 3 }]), '2:4');
});

test('rotasi tanpa selingan berjalan satu halaman per 15 detik dan kembali ke awal', () => {
  const jumlah = 4;
  const t0 = 1_000 * ROTATE_MS; // tepat di awal slot
  const urutan = [0, 1, 2, 3, 0].map((k) => halamanTampil(t0 + k * ROTATE_MS, jumlah, null));
  assert.deepEqual(urutan, [0, 1, 2, 3, 0]);
});

test('selingan menampilkan halaman pesan baru, lalu rotasi melanjutkan posisi jam yang sama', () => {
  const jumlah = 5;
  const t0 = 1_000 * ROTATE_MS;
  const detour = { halaman: 0, sampai: t0 + DETOUR_MS };
  assert.equal(halamanTampil(t0 + 1000, jumlah, detour), 0);
  assert.equal(halamanTampil(t0 + DETOUR_MS, jumlah, detour), halamanRotasi(t0 + DETOUR_MS, jumlah));
});

test('dengan 200 pesan dan pesan baru tiap 20 detik, setiap halaman tetap tampil dalam satu siklus penuh', () => {
  const jumlah = Math.ceil(200 / PAGE_SIZE); // 17 halaman
  const langkah = 100; // ms per sampel
  const siklus = (jumlah * ROTATE_MS) / langkah; // jumlah sampel per satu siklus
  const mulai = 1_700_000_000_000;
  const durasi = 60 * 60 * 1000;
  const hitungan = new Array(jumlah).fill(0);
  let tampil = 0;
  let minimal = jumlah;
  const jendela = [];
  let detour = null;

  for (let t = 0; t < durasi; t += langkah) {
    const now = mulai + t;
    if (t > 0 && t % 20_000 === 0) detour = { halaman: 0, sampai: now + DETOUR_MS };
    if (detour && now >= detour.sampai) detour = null;
    const p = halamanTampil(now, jumlah, detour);
    jendela.push(p);
    if (hitungan[p]++ === 0) tampil += 1;
    if (jendela.length > siklus) {
      const keluar = jendela.shift();
      if (--hitungan[keluar] === 0) tampil -= 1;
    }
    if (jendela.length === siklus) minimal = Math.min(minimal, tampil);
  }

  assert.equal(minimal, jumlah, 'ada halaman yang tidak tampil dalam satu siklus 255 detik');
});
