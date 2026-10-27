/* Logika murni untuk /wall dan /admin. Dipakai di browser (window.WallLogika) dan di tes. */
(function (root) {
  'use strict';

  // Grid longgar: kartu duduk di sel grid, lalu digoyang sedikit dari titik selnya.
  const GAP = 12;
  const ROW_UNIT = 60;
  const MIN_COL_W = 300;
  const PAD = 28; // padding kartu per sisi, px. Teks berada di dalam area ini.
  const EXT = 2; // kartu melebar 2px ke tiap sisi, jadi tetangga boleh bertumpuk di area padding
  const JITTER = 2; // geser acak maksimal per sumbu, px
  const MIRING = 2; // kemiringan maksimal, derajat
  const LINE_H = 35; // 24px * 1.45, dibulatkan ke atas
  const NAME_H = 35; // baris nama 17px ditambah jarak
  const CHAR_W = 13.5; // lebar karakter rata-rata 24px, dibuat konservatif
  const MAX_PER_PAGE = 14;
  const DETOUR_MS = 6000; // lama satu selingan pesan baru
  const DETOUR_GAP_MS = 90000; // jarak minimal antar selingan
  const ROTASI_BAWAAN_MS = 15000;

  // Kanvas logis tetap. Pembagian halaman dihitung dari kanvas ini saja, jadi semua layar
  // yang membuka /wall dengan daftar pesan yang sama memakai pembagian yang sama.
  // Layar hanya memperbesar atau memperkecil kanvas (lihat skalaKanvas).
  const DESIGN_W = 1856;
  const DESIGN_H = 760;

  const POSISI_QR = ['kanan-bawah', 'kanan-atas', 'kiri-atas', 'kiri-bawah', 'sembunyikan'];
  const BAWAAN_WALL = { qr: 'kanan-bawah', qrUkuran: 160, refresh: 5, rotasi: 15 };
  const RENTANG_WALL = { qrUkuran: [120, 400], refresh: [3, 30], rotasi: [8, 60] };
  const RENTANG_ADMIN = [5, 60];
  const BAWAAN_ADMIN_REFRESH = 10;

  // Nilai acak deterministik dari id pesan. Tidak memakai generator acak apa pun.
  function seed(id, salt) {
    let h = (Math.imul(id, 2654435761) ^ Math.imul(salt + 1, 40503)) >>> 0;
    h ^= h >>> 16;
    h = Math.imul(h, 2246822507) >>> 0;
    h ^= h >>> 13;
    h = Math.imul(h, 3266489909) >>> 0;
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }

  function jumlahKolom(lebar) {
    return Math.max(1, Math.floor((lebar + GAP) / (MIN_COL_W + GAP)));
  }

  function jumlahBaris(tinggi) {
    return Math.max(1, Math.floor((tinggi + GAP) / (ROW_UNIT + GAP)));
  }

  // Ukuran kartu dari panjang pesan (data asli), bukan dari angka acak.
  function kebutuhan(panjang, cs, cellW) {
    const lebar = cs * cellW + (cs - 1) * GAP + 2 * EXT;
    const perBaris = Math.max(8, Math.floor((lebar - 2 * PAD) / CHAR_W));
    const baris = Math.max(1, Math.ceil((panjang * 1.1) / perBaris)); // cadangan 10% untuk pemotongan kata
    const tinggi = baris * LINE_H + NAME_H + 2 * PAD;
    const rs = Math.ceil((tinggi + GAP - 2 * EXT) / (ROW_UNIT + GAP));
    return { cs, rs };
  }

  function cariSlot(panjang, occ, C, R, cellW, paksa) {
    const pref = panjang > 200 && C >= 3 ? 2 : 1;
    const urutan = [pref];
    for (let cs = 1; cs <= C; cs += 1) if (cs !== pref) urutan.push(cs);
    for (const cs0 of urutan) {
      const { rs } = kebutuhan(panjang, cs0, cellW);
      if (rs > R) continue;
      for (let r = 0; r + rs <= R; r += 1) {
        for (let c = 0; c + cs0 <= C; c += 1) {
          if (kosong(occ, r, c, rs, cs0)) return { col: c, row: r, cs: cs0, rs };
        }
      }
    }
    if (paksa) {
      // Papan terlalu kecil untuk pesan ini walau sendirian. Tampilkan di sudut,
      // dan jangan dianggap sebagai layout normal.
      return { col: 0, row: 0, cs: C, rs: R, terpaksa: true };
    }
    return null;
  }

  function kosong(occ, r, c, rs, cs) {
    for (let i = r; i < r + rs; i += 1) {
      for (let j = c; j < c + cs; j += 1) if (occ[i][j]) return false;
    }
    return true;
  }

  function tandai(occ, slot) {
    for (let i = slot.row; i < slot.row + slot.rs; i += 1) {
      for (let j = slot.col; j < slot.col + slot.cs; j += 1) occ[i][j] = true;
    }
  }

  // Sel kosong yang tersisa di sekitar kartu diisi dengan memanjangkan kartu ke bawah lalu ke kanan.
  // Kartu yang memanjang hanya menjadi lebih lapang, jadi teks tetap muat.
  function isiLubang(page, occ, C, R) {
    const bebas = (r0, c0, rs, cs) => {
      if (r0 + rs > R || c0 + cs > C) return false;
      for (let i = r0; i < r0 + rs; i += 1) {
        for (let j = c0; j < c0 + cs; j += 1) if (occ[i][j]) return false;
      }
      return true;
    };
    const isi = (r0, c0, rs, cs) => {
      for (let i = r0; i < r0 + rs; i += 1) {
        for (let j = c0; j < c0 + cs; j += 1) occ[i][j] = true;
      }
    };
    for (const pl of page) {
      let besar = true;
      while (besar) {
        besar = false;
        if (bebas(pl.row + pl.rs, pl.col, 1, pl.cs)) {
          isi(pl.row + pl.rs, pl.col, 1, pl.cs);
          pl.rs += 1;
          besar = true;
        }
        if (bebas(pl.row, pl.col + pl.cs, pl.rs, 1)) {
          isi(pl.row, pl.col + pl.cs, pl.rs, 1);
          pl.cs += 1;
          besar = true;
        }
      }
    }
  }

  // Membagi pesan (urut, terbaru dulu) menjadi halaman di atas kanvas logis. Hasilnya hanya
  // bergantung pada daftar pesan. Tiap halaman diisi sampai kanvas penuh atau MAX_PER_PAGE.
  // Sel kosong yang tersisa diisi pesan berikutnya yang muat.
  function paginasLayout(messages) {
    const C = jumlahKolom(DESIGN_W);
    const R = jumlahBaris(DESIGN_H);
    const cellW = (DESIGN_W - (C - 1) * GAP) / C;
    const sisa = messages.slice();
    const pages = [];

    while (sisa.length > 0) {
      const occ = Array.from({ length: R }, () => new Array(C).fill(false));
      const page = [];
      let i = 0;
      while (i < sisa.length && page.length < MAX_PER_PAGE) {
        const m = sisa[i];
        const slot = cariSlot(m.message.length, occ, C, R, cellW, page.length === 0);
        if (!slot) {
          i += 1;
          continue;
        }
        tandai(occ, slot);
        page.push({
          m,
          col: slot.col,
          row: slot.row,
          cs: slot.cs,
          rs: slot.rs,
          terpaksa: Boolean(slot.terpaksa),
          dx: (seed(m.id, 1) * 2 - 1) * JITTER,
          dy: (seed(m.id, 2) * 2 - 1) * JITTER,
          rot: (seed(m.id, 3) * 2 - 1) * MIRING,
          z: 1 + Math.floor(seed(m.id, 4) * 6),
        });
        sisa.splice(i, 1);
      }
      isiLubang(page, occ, C, R);
      pages.push(page);
    }
    return pages;
  }

  function jumlahHalaman(pages) {
    return Math.max(1, pages.length);
  }

  // Rotasi berbasis langkah jam dari titik dasar. Perubahan jeda memakai gantiJeda(),
  // sehingga halaman yang sedang tampil tetap sama dan tidak kembali ke halaman 1.
  function rotasiAwal(now, jeda) {
    return { dasar: 0, mulai: now, jeda };
  }

  function halamanRotasi(now, jumlah, rot) {
    const langkah = Math.floor((now - rot.mulai) / rot.jeda);
    return (((rot.dasar + langkah) % jumlah) + jumlah) % jumlah;
  }

  function gantiJeda(rot, now, jumlah, jedaBaru) {
    return { dasar: halamanRotasi(now, jumlah, rot), mulai: now, jeda: jedaBaru };
  }

  // Selingan: halaman tempat pesan baru berada ditampilkan sampai `sampai`, lalu rotasi lanjut.
  function halamanTampil(now, jumlah, detour, rot) {
    if (detour && now < detour.sampai && detour.halaman < jumlah) return detour.halaman;
    return halamanRotasi(now, jumlah, rot);
  }

  // Penjadwal selingan. Paling banyak satu selingan per DETOUR_GAP_MS. Pesan baru yang datang
  // saat masa jeda tidak memicu apa-apa; mereka menunggu di antrean dan ditampilkan sekaligus
  // dalam satu selingan ketika jeda berakhir. `terbaru` adalah id pesan paling baru di antrean.
  function jadwalSelingan(sel, now, antrean, terbaru) {
    if (antrean.length === 0 || terbaru === null) return { sel, mulai: false };
    if (sel.terakhir !== null && now - sel.terakhir < DETOUR_GAP_MS) return { sel, mulai: false };
    return { sel: { terakhir: now }, mulai: true };
  }

  // Skala kanvas agar muat di area papan dengan margin di tiap sisi. Kartu yang diputar bisa
  // melebar sekitar 14px di tepinya, jadi margin 24px menjaga semua kartu tetap di dalam layar.
  const MARGIN_LAYAR = 24;
  function skalaKanvas(lebarArea, tinggiArea) {
    const lebar = lebarArea - 2 * MARGIN_LAYAR;
    const tinggi = tinggiArea - 2 * MARGIN_LAYAR;
    const s = Math.max(0.1, Math.min(lebar / DESIGN_W, tinggi / DESIGN_H));
    return {
      s,
      x: (lebarArea - DESIGN_W * s) / 2,
      y: (tinggiArea - DESIGN_H * s) / 2,
    };
  }

  // Sama dengan field checksum di GET /api/messages: "jumlah:jumlah id".
  function checksum(list) {
    return `${list.length}:${list.reduce((s, m) => s + m.id, 0)}`;
  }

  function angka(nilai, [lo, hi], bawaan) {
    if (nilai === undefined || nilai === null || String(nilai).trim() === '') return bawaan;
    const n = Number(nilai);
    if (!Number.isFinite(n)) return bawaan;
    return Math.min(hi, Math.max(lo, Math.round(n)));
  }

  // Urutan prioritas: URL > localStorage > bawaan. Nilai di luar rentang dijepit.
  // Nilai yang tidak valid memakai bawaan.
  function pengaturanWall(tersimpan, query) {
    const q = query || {};
    const s = tersimpan || {};
    const pilih = (url, simpan) => (url !== undefined ? url : simpan);
    const qr = pilih(q.qr, s.qr);
    return {
      qr: POSISI_QR.includes(qr) ? qr : BAWAAN_WALL.qr,
      qrUkuran: angka(pilih(q['qr-ukuran'], s.qrUkuran), RENTANG_WALL.qrUkuran, BAWAAN_WALL.qrUkuran),
      refresh: angka(pilih(q.refresh, s.refresh), RENTANG_WALL.refresh, BAWAAN_WALL.refresh),
      rotasi: angka(pilih(q.rotasi, s.rotasi), RENTANG_WALL.rotasi, BAWAAN_WALL.rotasi),
    };
  }

  // Nilai refresh admin: angka 5 sampai 60, atau 'mati'.
  function pengaturanAdmin(tersimpan) {
    const s = tersimpan || {};
    if (s.refresh === 'mati') return { refresh: 'mati' };
    return { refresh: angka(s.refresh, RENTANG_ADMIN, BAWAAN_ADMIN_REFRESH) };
  }

  const api = {
    GAP,
    ROW_UNIT,
    DESIGN_W,
    DESIGN_H,
    DETOUR_GAP_MS,
    jadwalSelingan,
    skalaKanvas,
    MARGIN_LAYAR,
    PAD,
    EXT,
    JITTER,
    MIRING,
    MAX_PER_PAGE,
    DETOUR_MS,
    ROTASI_BAWAAN_MS,
    POSISI_QR,
    BAWAAN_WALL,
    RENTANG_WALL,
    BAWAAN_ADMIN_REFRESH,
    RENTANG_ADMIN,
    seed,
    jumlahKolom,
    jumlahBaris,
    paginasLayout,
    jumlahHalaman,
    rotasiAwal,
    halamanRotasi,
    gantiJeda,
    halamanTampil,
    checksum,
    angka,
    pengaturanWall,
    pengaturanAdmin,
  };

  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.WallLogika = api;
  }
})(typeof self !== 'undefined' ? self : globalThis);
