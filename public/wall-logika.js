/* Logika murni untuk /wall. Dipakai di browser (window.WallLogika) dan di tes. */
(function (root) {
  'use strict';

  const PAGE_SIZE = 12;
  const ROTATE_MS = 15000;
  const DETOUR_MS = 8000;

  function jumlahHalaman(n) {
    return Math.max(1, Math.ceil(n / PAGE_SIZE));
  }

  // Rotasi berbasis jam: indeks halaman hanya bergantung pada waktu, jadi
  // perubahan data tidak pernah me-reset urutan.
  function halamanRotasi(now, jumlah) {
    return Math.floor(now / ROTATE_MS) % jumlah;
  }

  // Selingan: halaman tempat pesan baru berada ditampilkan sampai `sampai`,
  // lalu rotasi berjalan lagi dari posisi jam yang sama.
  function halamanTampil(now, jumlah, detour) {
    if (detour && now < detour.sampai && detour.halaman < jumlah) return detour.halaman;
    return halamanRotasi(now, jumlah);
  }

  // Sama dengan field checksum di GET /api/messages: "jumlah:jumlah id".
  function checksum(list) {
    return `${list.length}:${list.reduce((s, m) => s + m.id, 0)}`;
  }

  const api = {
    PAGE_SIZE,
    ROTATE_MS,
    DETOUR_MS,
    jumlahHalaman,
    halamanRotasi,
    halamanTampil,
    checksum,
  };

  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.WallLogika = api;
  }
})(typeof self !== 'undefined' ? self : globalThis);
