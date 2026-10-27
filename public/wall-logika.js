/* Logika murni untuk /wall dan /admin. Dipakai di browser (window.WallLogika) dan di tes. */
(function (root) {
  'use strict';

  // ---------- Konstanta ----------

  const GAP = 40;
  const ROW_UNIT = 60;
  const MIN_COL_W = 300;
  // Bantalan teks per sisi, dalam px kanvas. Kotak teks = kertas dikurangi PAD di tiap sisi.
  const PAD = 40;
  // Kertas melebar EXT ke tiap sisi selnya.
  const EXT = 2;
  // Selotip menjulur TAPE_OUT di luar kertas (sudut selotip yang diputar, bukan lebar kotaknya). Dihitung sebagai bagian kertas.
  const TAPE_OUT = 20;
  // Geseran maksimal dari titik sel, sebagai fraksi lebar sel (x) dan tinggi sel (y).
  const GESER = 0.4;
  // Kemiringan dalam derajat. Besarnya antara setengah dan penuh batas, sesuai ukuran kartu.
  const MIRING_MIN = 3;
  const MIRING_MAX = 7;
  const SEL_PENUH = 8;
  // Tumpang tindih dua kertas dibatasi sebagai fraksi luas kertas yang lebih kecil.
  const TUMPANG_MAKS = 0.12;
  // Tepi kanvas yang dibiarkan kosong, supaya kertas dan selotip tidak pernah keluar layar.
  const EDGE = EXT + TAPE_OUT;
  const LINE_H = 35; // 24px * 1.45, dibulatkan ke atas
  const NAME_H = 35; // baris nama 17px ditambah jarak
  const CHAR_W = 13.5; // lebar karakter rata-rata 24px, dibuat konservatif
  const MAX_PER_PAGE = 14;
  const DETOUR_MS = 6000;
  const DETOUR_GAP_MS = 90000;
  const ROTASI_BAWAAN_MS = 10000;

  // Kanvas logis tetap. Pembagian halaman bergantung pada kanvas ini dan pada daftar pesan.
  const DESIGN_W = 1856;
  const DESIGN_H = 900;
  const MARGIN_LAYAR = 24;

  const POSISI_QR = ['kanan-bawah', 'kanan-atas', 'kiri-atas', 'kiri-bawah', 'sembunyikan'];
  const BAWAAN_WALL = { qr: 'kanan-bawah', qrUkuran: 160, refresh: 5, rotasi: 10 };
  const RENTANG_WALL = { qrUkuran: [120, 400], refresh: [3, 30], rotasi: [8, 60] };
  const RENTANG_ADMIN = [5, 60];
  const BAWAAN_ADMIN_REFRESH = 10;

  // ---------- Acak deterministik ----------

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

  // ---------- Grid dan ukuran ----------

  function jumlahKolom(lebar) {
    return Math.max(1, Math.floor((lebar + GAP) / (MIN_COL_W + GAP)));
  }

  function jumlahBaris(tinggi) {
    return Math.max(1, Math.floor((tinggi + GAP) / (ROW_UNIT + GAP)));
  }

  // Ukuran kartu dari panjang pesan (data asli). Kertas = sel (cs x rs) + EXT di tiap sisi.
  function kebutuhan(panjang, cs, cellW) {
    const lebar = cs * cellW + (cs - 1) * GAP + 2 * EXT;
    const perBaris = Math.max(8, Math.floor((lebar - 2 * PAD) / CHAR_W));
    const baris = Math.max(1, Math.ceil((panjang * 1.1) / perBaris)); // cadangan 10% untuk pemotongan kata
    const tinggi = baris * LINE_H + NAME_H + 2 * PAD;
    const rs = Math.ceil((tinggi + GAP - 2 * EXT) / (ROW_UNIT + GAP));
    return { cs, rs };
  }

  function kosongSel(occ, r, c, rs, cs) {
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

  function cariSlot(panjang, occ, C, R, cellW, paksa) {
    const pref = panjang > 200 && C >= 3 ? 2 : 1;
    const urutan = [pref];
    for (let cs = 1; cs <= C; cs += 1) if (cs !== pref) urutan.push(cs);
    for (const cs0 of urutan) {
      const { rs } = kebutuhan(panjang, cs0, cellW);
      if (rs > R) continue;
      for (let r = 0; r + rs <= R; r += 1) {
        for (let c = 0; c + cs0 <= C; c += 1) {
          if (kosongSel(occ, r, c, rs, cs0)) return { col: c, row: r, cs: cs0, rs };
        }
      }
    }
    if (paksa) {
      // Kanvas terlalu kecil untuk pesan ini walau sendirian. Dipaksa di sudut dan ditandai.
      return { col: 0, row: 0, cs: C, rs: R, terpaksa: true };
    }
    return null;
  }

  // Peregangan untuk menutup sel kosong: hanya ke bawah, maksimal 1,3 kali tinggi alami kartu,
  // dan tidak pernah menambah lebar kolom. Sel yang tetap kosong dibiarkan kosong.
  function isiLubang(page, occ, C, R) {
    const bebas = (r0, c0, rs, cs) => {
      if (r0 + rs > R || c0 + cs > C) return false;
      for (let i = r0; i < r0 + rs; i += 1) {
        for (let j = c0; j < c0 + cs; j += 1) if (occ[i][j]) return false;
      }
      return true;
    };
    for (const pl of page) {
      const batas = Math.floor(pl.rsAlami * 1.3);
      while (pl.rs < batas && bebas(pl.row + pl.rs, pl.col, 1, pl.cs)) {
        for (let j = pl.col; j < pl.col + pl.cs; j += 1) occ[pl.row + pl.rs][j] = true;
        pl.rs += 1;
      }
    }
  }

  // ---------- Geometri: kertas, kotak teks, tabrakan ----------
  //
  // Jaminan teks tidak tertutup. Untuk dua kartu A dan B, kotak teks A (kertas A dikurangi PAD)
  // tidak boleh bersinggungan dengan kertas B (diperbesar TAPE_OUT). Ini diperiksa dengan geometri
  // penuh, termasuk kemiringan dan geseran, bukan dengan rumus perkiraan. Kalau ada pelanggaran,
  // geseran dan kemiringan kartu yang menabrak dipangkas setengah, berulang sampai nol.
  // Rumus kasar untuk anggaran bantalan: geseran kedua kertas plus tambahan tinggi akibat kemiringan,
  // ((w/2) sin θ + (h/2) sin θ), harus lebih kecil dari PAD + GAP. Pemeriksaan geometri di sini
  // menangkap kasus yang tidak tertangkap rumus itu.

  function sudutRad(d) {
    return (d * Math.PI) / 180;
  }

  // Empat sudut kotak berpusat (cx, cy), setengah lebar hw, setengah tinggi hh, diputar theta derajat.
  function sudutKotak(cx, cy, hw, hh, theta) {
    const c = Math.cos(sudutRad(theta));
    const s = Math.sin(sudutRad(theta));
    return [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]].map(([x, y]) => [cx + x * c - y * s, cy + x * s + y * c]);
  }

  function proyeksi(poli, nx, ny) {
    let mn = Infinity;
    let mx = -Infinity;
    for (const [x, y] of poli) {
      const d = x * nx + y * ny;
      if (d < mn) mn = d;
      if (d > mx) mx = d;
    }
    return [mn, mx];
  }

  // Pemisahan sumbu (SAT) untuk dua poligon cembung. Sentuhan dihitung sebagai tabrakan.
  function bertabrakan(a, b) {
    for (const poli of [a, b]) {
      for (let i = 0; i < 4; i += 1) {
        const [x1, y1] = poli[i];
        const [x2, y2] = poli[(i + 1) % 4];
        const nx = y2 - y1;
        const ny = x1 - x2;
        const [a0, a1] = proyeksi(a, nx, ny);
        const [b0, b1] = proyeksi(b, nx, ny);
        if (a1 < b0 || b1 < a0) return false;
      }
    }
    return true;
  }

  function luasPoli(p) {
    let s = 0;
    for (let i = 0; i < p.length; i += 1) {
      const [x1, y1] = p[i];
      const [x2, y2] = p[(i + 1) % p.length];
      s += x1 * y2 - x2 * y1;
    }
    return Math.abs(s) / 2;
  }

  // Potong poligon `subj` dengan satu sisi p1-p2, ambil sisi dalam. Kedua poligon berorientasi sama.
  function potong(subj, p1, p2) {
    const dalam = (p) => (p2[0] - p1[0]) * (p[1] - p1[1]) - (p2[1] - p1[1]) * (p[0] - p1[0]) >= 0;
    const potongGaris = (s, e) => {
      const [x1, y1] = s;
      const [x2, y2] = e;
      const [x3, y3] = p1;
      const [x4, y4] = p2;
      const den = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
      const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / den;
      return [x1 + t * (x2 - x1), y1 + t * (y2 - y1)];
    };
    const out = [];
    for (let i = 0; i < subj.length; i += 1) {
      const cur = subj[i];
      const prev = subj[(i + subj.length - 1) % subj.length];
      if (dalam(cur)) {
        if (!dalam(prev)) out.push(potongGaris(prev, cur));
        out.push(cur);
      } else if (dalam(prev)) {
        out.push(potongGaris(prev, cur));
      }
    }
    return out;
  }

  // Luas irisan dua poligon cembung (Sutherland-Hodgman).
  function luasTumpang(a, b) {
    let subj = a;
    for (let i = 0; i < 4; i += 1) {
      subj = potong(subj, b[i], b[(i + 1) % 4]);
      if (subj.length === 0) return 0;
    }
    return luasPoli(subj);
  }

  function dimensiSel(pl, cellW) {
    return {
      x: EDGE + pl.col * (cellW + GAP),
      y: EDGE + pl.row * (ROW_UNIT + GAP),
      w: pl.cs * cellW + (pl.cs - 1) * GAP,
      h: pl.rs * ROW_UNIT + (pl.rs - 1) * GAP,
    };
  }

  // Geometri final satu kartu: kertas dengan selotip, kertas tanpa selotip, dan kotak teks.
  function geometriKartu(pl, cellW) {
    const d = dimensiSel(pl, cellW);
    const cx = d.x + d.w / 2 + pl.dx;
    const cy = d.y + d.h / 2 + pl.dy;
    const hw = d.w / 2 + EXT;
    const hh = d.h / 2 + EXT;
    const luas = sudutKotak(cx, cy, hw, hh, pl.rot);
    return {
      kertas: sudutKotak(cx, cy, hw + TAPE_OUT, hh + TAPE_OUT, pl.rot),
      luas,
      teks: sudutKotak(cx, cy, hw - PAD, hh - PAD, pl.rot),
      luasKertas: luasPoli(luas),
    };
  }

  // Besaran geseran dan kemiringan dari seed. Tidak pernah nol: 0,5 sampai 1 kali batas.
  // `sgn` membalik arah (cermin). `k` adalah faktor yang dicari selesaikanTabrakan.
  function terapkanGeser(pl, cellW) {
    const besar = (f) => 0.5 + 0.5 * Math.abs(f);
    const tanda = (f) => (f < 0 ? -1 : 1);
    pl.dx = pl.sgn * tanda(pl.fx) * GESER * cellW * besar(pl.fx) * pl.k;
    pl.dy = pl.sgn * tanda(pl.fy) * GESER * ROW_UNIT * besar(pl.fy) * pl.k;
    pl.rot = pl.sgn * tanda(pl.fr) * pl.miringMaks * besar(pl.fr) * pl.k;
  }

  // Kertas, termasuk selotip, tidak boleh keluar dari kanvas. Kanvas adalah area yang terlihat.
  function keluarKanvas(poli) {
    const e = 1e-6;
    return poli.some(([x, y]) => x < -e || y < -e || x > DESIGN_W + e || y > DESIGN_H + e);
  }

  // Pelanggaran kanvas dan blokir untuk satu kartu.
  function melanggarTepi(geo, blokir) {
    if (keluarKanvas(geo.kertas)) return true;
    const kotak = (b) => sudutKotak(b.x + b.w / 2, b.y + b.h / 2, b.w / 2, b.h / 2, 0);
    return (blokir || []).some((b) => bertabrakan(geo.kertas, kotak(b)));
  }

  // Pelanggaran terhadap kartu lain: teks menabrak kertas, atau tumpang tindih di atas batas.
  function melanggarKartu(a, b) {
    if (bertabrakan(a.teks, b.kertas) || bertabrakan(b.teks, a.kertas)) return true;
    const kecil = Math.min(a.luasKertas, b.luasKertas);
    return luasTumpang(a.luas, b.luas) > TUMPANG_MAKS * kecil;
  }

  // Apakah kartu aman pada k dan arah yang sedang diset. Lawannya: kartu yang sudah dibekukan
  // (pada k-nya), dan kartu yang belum diproses pada k = 0. Dengan begitu kartu yang belum
  // diproses selalu punya posisi aman di sel-nya, dan tidak ada kartu yang terjepit.
  function amanPada(pl, cellW, beku, sisa, blokir) {
    const geo = geometriKartu(pl, cellW);
    if (melanggarTepi(geo, blokir)) return false;
    const lawan = [...beku, ...sisa.map((o) => ({ ...o, dx: 0, dy: 0, rot: 0 }))];
    return lawan.every((o) => !melanggarKartu(geo, geometriKartu(o, cellW)));
  }

  // Cari k terbesar yang aman untuk satu arah: cek k = 1 dulu, lalu pencarian biner 8 iterasi.
  function cariK(pl, sgn, cellW, beku, sisa, blokir) {
    pl.sgn = sgn;
    pl.k = 1;
    terapkanGeser(pl, cellW);
    if (amanPada(pl, cellW, beku, sisa, blokir)) return 1;
    let lo = 0;
    let hi = 1;
    for (let it = 0; it < 8; it += 1) {
      const mid = (lo + hi) / 2;
      pl.k = mid;
      terapkanGeser(pl, cellW);
      if (amanPada(pl, cellW, beku, sisa, blokir)) lo = mid;
      else hi = mid;
    }
    pl.k = lo;
    terapkanGeser(pl, cellW);
    return lo;
  }

  // Satu kartu per giliran, urut deterministik (z, lalu id). Kartu yang sudah diproses dibekukan
  // pada k-nya. Kartu yang sedang diproses yang mengalah. Arah seed dicoba dulu; kalau terhalang,
  // arah cermin dicoba pada k penuh sebelum k diperkecil.
  function selesaikanTabrakan(page, cellW, blokir) {
    const urut = [...page].sort((a, b) => a.z - b.z || a.m.id - b.m.id);
    const beku = [];
    for (let idx = 0; idx < urut.length; idx += 1) {
      const pl = urut[idx];
      const sisa = urut.slice(idx + 1);
      const kS = cariK(pl, 1, cellW, beku, sisa, blokir);
      let pilih = { sgn: 1, k: kS };
      if (kS < 1) {
        pl.sgn = -1;
        pl.k = 1;
        terapkanGeser(pl, cellW);
        if (amanPada(pl, cellW, beku, sisa, blokir)) {
          pilih = { sgn: -1, k: 1 };
        } else {
          const kM = cariK(pl, -1, cellW, beku, sisa, blokir);
          if (kM > kS) pilih = { sgn: -1, k: kM };
        }
      }
      pl.sgn = pilih.sgn;
      pl.k = pilih.k;
      terapkanGeser(pl, cellW);
      beku.push(pl);
    }
    return true;
  }

  // ---------- Pembagian halaman ----------

  // `blokir` berisi kotak {x, y, w, h} dalam koordinat kanvas, misalnya tempat QR dan indikator
  // halaman. Sel yang tersentuh kotak itu ditandai terpakai sebelum pengepakan dimulai.
  // Ukuran grid kanvas logis. Dipakai pembagian halaman, geometri, dan tes.
  function kisiGrid() {
    const C = jumlahKolom(DESIGN_W - 2 * EDGE);
    const R = jumlahBaris(DESIGN_H - 2 * EDGE);
    const cellW = (DESIGN_W - 2 * EDGE - (C - 1) * GAP) / C;
    return { C, R, cellW };
  }

  function paginasLayout(messages, blokir) {
    const { C, R, cellW } = kisiGrid();
    const sisa = messages.slice();
    const pages = [];
    const occAwal = () => {
      const occ = Array.from({ length: R }, () => new Array(C).fill(false));
      // Kotak terblokir diperbesar EDGE: kertas yang tepat di sel tetangga tetap butuh ruang itu.
      for (const b0 of blokir || []) {
        const b = { x: b0.x - EDGE, y: b0.y - EDGE, w: b0.w + 2 * EDGE, h: b0.h + 2 * EDGE };
        for (let r = 0; r < R; r += 1) {
          const y0 = EDGE + r * (ROW_UNIT + GAP);
          if (y0 >= b.y + b.h || y0 + ROW_UNIT <= b.y) continue;
          for (let c = 0; c < C; c += 1) {
            const x0 = EDGE + c * (cellW + GAP);
            if (x0 >= b.x + b.w || x0 + cellW <= b.x) continue;
            occ[r][c] = true;
          }
        }
      }
      return occ;
    };

    while (sisa.length > 0) {
      const occ = occAwal();
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
          rsAlami: slot.rs,
          sgn: 1,
          fx: 2 * seed(m.id, 1) - 1,
          fy: 2 * seed(m.id, 2) - 1,
          fr: 2 * seed(m.id, 3) - 1,
          miringMaks: 0,
          k: 1,
          dx: 0,
          dy: 0,
          rot: 0,
          z: 1 + Math.floor(seed(m.id, 4) * 6),
        });
        sisa.splice(i, 1);
      }
      isiLubang(page, occ, C, R);
      for (const pl of page) {
        // Kartu besar lebih lurus, kartu kecil mendekati MIRING_MAX.
        const t = Math.min(1, (pl.cs * pl.rs) / SEL_PENUH);
        pl.miringMaks = MIRING_MAX - (MIRING_MAX - MIRING_MIN) * t;
      }
      selesaikanTabrakan(page, cellW, blokir);
      pages.push(page);
    }
    return pages;
  }

  function jumlahHalaman(pages) {
    return Math.max(1, pages.length);
  }

  // ---------- Rotasi, selingan, dan skala ----------

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

  // Penjadwal selingan. Paling banyak satu per DETOUR_GAP_MS. Pesan baru yang datang saat masa
  // jeda tidak memicu apa-apa; mereka menunggu di antrean dan tampil sekaligus saat jeda berakhir.
  function jadwalSelingan(sel, now, antrean, terbaru) {
    if (antrean.length === 0 || terbaru === null) return { sel, mulai: false };
    if (sel.terakhir !== null && now - sel.terakhir < DETOUR_GAP_MS) return { sel, mulai: false };
    return { sel: { terakhir: now }, mulai: true };
  }

  // Skala kanvas agar muat di area papan, dengan margin di tiap sisi. Skala TIDAK bergantung pada QR.
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

  // ---------- Pengaturan ----------

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
    PAD,
    EXT,
    EDGE,
    TAPE_OUT,
    GESER,
    MIRING_MIN,
    MIRING_MAX,
    TUMPANG_MAKS,
    MAX_PER_PAGE,
    DETOUR_MS,
    DETOUR_GAP_MS,
    ROTASI_BAWAAN_MS,
    DESIGN_W,
    DESIGN_H,
    MARGIN_LAYAR,
    POSISI_QR,
    BAWAAN_WALL,
    RENTANG_WALL,
    BAWAAN_ADMIN_REFRESH,
    RENTANG_ADMIN,
    seed,
    jumlahKolom,
    jumlahBaris,
    kisiGrid,
    paginasLayout,
    selesaikanTabrakan,
    geometriKartu,
    bertabrakan,
    luasTumpang,
    jumlahHalaman,
    rotasiAwal,
    halamanRotasi,
    gantiJeda,
    halamanTampil,
    jadwalSelingan,
    skalaKanvas,
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
