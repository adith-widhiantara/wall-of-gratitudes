'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const L = require('../public/wall-logika.js');

const T0 = 1_700_000_000_000;
function pesan(id, panjang) {
  return { id, name: null, message: 'a'.repeat(panjang), color: 'mint', created_at: T0 + id };
}
function daftar(n) {
  return Array.from({ length: n }, (_, i) => pesan(i + 1, 3 + Math.floor(L.seed(i + 1, 7) * 278)));
}

test('checksum sama dengan format server: jumlah:jumlah id', () => {
  assert.equal(L.checksum([]), '0:0');
  assert.equal(L.checksum([{ id: 1 }, { id: 3 }]), '2:4');
});

test('seed deterministik, dalam [0,1), dan tidak ada Math.random di wall', () => {
  assert.equal(L.seed(42, 1), L.seed(42, 1));
  for (let i = 0; i < 5000; i += 1) {
    const v = L.seed(i, 3);
    assert.ok(v >= 0 && v < 1, `seed(${i}) = ${v}`);
  }
  for (const f of ['wall.js', 'wall-logika.js']) {
    const src = fs.readFileSync(path.join(__dirname, '..', 'public', f), 'utf8');
    assert.ok(!src.includes('Math.random'), `${f} memakai Math.random`);
  }
});

test('pembagian halaman hanya bergantung pada daftar pesan dan deterministik', () => {
  const list = daftar(120);
  const a = L.paginasLayout(list).map((pg) => pg.map((pl) => [pl.m.id, pl.col, pl.row, pl.cs, pl.rs, pl.z]));
  const b = L.paginasLayout(list.slice()).map((pg) => pg.map((pl) => [pl.m.id, pl.col, pl.row, pl.cs, pl.rs, pl.z]));
  assert.deepEqual(a, b);
});

test('setiap pesan muncul tepat sekali dan kartu selalu di dalam kanvas', () => {
  const list = daftar(200);
  const pages = L.paginasLayout(list);
  const C = L.jumlahKolom(L.DESIGN_W);
  const R = L.jumlahBaris(L.DESIGN_H);
  const ids = [];
  for (const pg of pages) {
    const occ = Array.from({ length: R }, () => new Array(C).fill(false));
    for (const pl of pg) {
      ids.push(pl.m.id);
      assert.ok(!pl.terpaksa, `pesan ${pl.m.id} tidak muat di kanvas`);
      assert.ok(pl.col + pl.cs <= C && pl.row + pl.rs <= R, 'kartu keluar kanvas');
      for (let i = pl.row; i < pl.row + pl.rs; i += 1) {
        for (let j = pl.col; j < pl.col + pl.cs; j += 1) {
          assert.ok(!occ[i][j], 'dua kartu di sel yang sama');
          occ[i][j] = true;
        }
      }
    }
  }
  assert.deepEqual([...ids].sort((x, y) => x - y), list.map((m) => m.id).sort((x, y) => x - y));
});

test('isi halaman bervariasi dan dibatasi MAX_PER_PAGE', () => {
  const pages = L.paginasLayout(daftar(200));
  for (const pg of pages) assert.ok(pg.length <= L.MAX_PER_PAGE);
  const sizes = new Set(pages.map((pg) => pg.length));
  assert.ok(sizes.size > 1, 'jumlah kartu per halaman seharusnya bervariasi');
});

test('kartu di dalam kanvas: jitter dan kemiringan dalam batas JITTER dan MIRING', () => {
  for (const pg of L.paginasLayout(daftar(60))) {
    for (const pl of pg) {
      assert.ok(Math.abs(pl.dx) <= L.JITTER && Math.abs(pl.dy) <= L.JITTER);
      assert.ok(Math.abs(pl.rot) <= L.MIRING);
    }
  }
});

test('rotasi: satu halaman per jeda, lalu kembali ke awal', () => {
  const jumlah = 4;
  const t0 = 1_000 * 15000;
  const rot = L.rotasiAwal(t0, 15000);
  const urutan = [0, 1, 2, 3, 4].map((k) => L.halamanTampil(t0 + k * 15000, jumlah, null, rot));
  assert.deepEqual(urutan, [0, 1, 2, 3, 0]);
});

test('ganti jeda rotasi tidak me-reset halaman yang sedang tampil', () => {
  const jumlah = 10;
  const t0 = 5_000_000;
  const rot = L.rotasiAwal(t0, 15000);
  const sebelum = L.halamanTampil(t0 + 40_000, jumlah, null, rot);
  const rot2 = L.gantiJeda(rot, t0 + 40_000, jumlah, 30000);
  assert.equal(L.halamanTampil(t0 + 40_000, jumlah, null, rot2), sebelum);
  assert.notEqual(sebelum, 0, 'uji ini butuh halaman selain 1');
});

test('selingan: paling banyak satu per 90 detik, pesan yang menumpuk digabung', () => {
  let sel = { terakhir: null };
  const antrean = [5];
  const r1 = L.jadwalSelingan(sel, 1000, antrean, 5);
  assert.equal(r1.mulai, true);
  sel = r1.sel;
  // Pesan lain datang saat masa jeda: tidak boleh memicu selingan.
  const r2 = L.jadwalSelingan(sel, 1000 + 60_000, [5, 6, 7], 7);
  assert.equal(r2.mulai, false);
  const r3 = L.jadwalSelingan(sel, 1000 + L.DETOUR_GAP_MS - 1, [5, 6, 7], 7);
  assert.equal(r3.mulai, false);
  const r4 = L.jadwalSelingan(sel, 1000 + L.DETOUR_GAP_MS, [5, 6, 7], 7);
  assert.equal(r4.mulai, true, 'antrean yang menumpuk tampil sekali saat jeda berakhir');
});

test('selingan: tanpa antrean tidak ada apa-apa', () => {
  assert.equal(L.jadwalSelingan({ terakhir: null }, 1000, [], null).mulai, false);
});

test('durasi selingan 6 detik dan penanda .baru di wall.js mengikuti durasi itu', () => {
  assert.equal(L.DETOUR_MS, 6000);
  const src = fs.readFileSync(path.join(__dirname, '..', 'public', 'wall.js'), 'utf8');
  assert.ok(!/FRESH_MS\s*=\s*3000/.test(src));
  assert.ok(!src.includes('PAGE_SIZE'));
});

test('skala kanvas memuat kanvas di tengah area tanpa melampauinya', () => {
  for (const [w, h] of [[1920, 1080], [1000, 500], [400, 900]]) {
    const { s, x, y } = L.skalaKanvas(w, h);
    const m = L.MARGIN_LAYAR;
    assert.ok(L.DESIGN_W * s <= w - 2 * m + 0.001 && L.DESIGN_H * s <= h - 2 * m + 0.001);
    assert.ok(Math.abs(x - (w - L.DESIGN_W * s) / 2) < 0.001);
    assert.ok(Math.abs(y - (h - L.DESIGN_H * s) / 2) < 0.001);
  }
});

test('pengaturan wall: URL menimpa tersimpan, nilai dijepit, nilai tidak valid memakai bawaan', () => {
  const tersimpan = { qr: 'kiri-atas', qrUkuran: 200, refresh: 8, rotasi: 20 };
  assert.deepEqual(L.pengaturanWall(tersimpan, {}), tersimpan);
  assert.deepEqual(
    L.pengaturanWall(tersimpan, { qr: 'kanan-atas', 'qr-ukuran': '999', refresh: '1', rotasi: 'abc' }),
    { qr: 'kanan-atas', qrUkuran: 400, refresh: 3, rotasi: 15 },
  );
  assert.deepEqual(L.pengaturanWall({}, { qr: 'pojok' }), L.pengaturanWall({}, {}));
  assert.equal(L.pengaturanWall({}, {}).qrUkuran, 160);
  assert.equal(L.pengaturanWall({}, { 'qr-ukuran': '' }).qrUkuran, 160);
});

test('pengaturan admin: angka 5 sampai 60 atau mati', () => {
  assert.deepEqual(L.pengaturanAdmin({ refresh: 'mati' }), { refresh: 'mati' });
  assert.deepEqual(L.pengaturanAdmin({ refresh: 90 }), { refresh: 60 });
  assert.deepEqual(L.pengaturanAdmin({}), { refresh: 10 });
});
