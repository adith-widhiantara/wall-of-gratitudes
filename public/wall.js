(() => {
  'use strict';

  const { PAGE_SIZE, ROTATE_MS, DETOUR_MS, jumlahHalaman, halamanTampil, checksum } = window.WallLogika;
  const POLL_MS = 5000;
  const TICK_MS = 1000;
  const FULL_SYNC_EVERY = 12; // jaring pengaman berkala, sekitar 60 detik
  const FRESH_MS = 3000;
  const IDLE_MS = 3000;
  const FADE_MS = 400;

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const papan = document.getElementById('papan');
  const kosong = document.getElementById('kosong');
  const halaman = document.getElementById('halaman');
  const jumlah = document.getElementById('jumlah');

  let messages = []; // approved, terbaru dulu
  let signature = '';
  let maxId = 0;
  let polls = 0;
  let shown = -1;
  let detour = null; // { halaman, sampai } untuk pesan baru
  let renderId = 0;
  let freshIds = new Set();
  let freshTimer = null;

  // Kemiringan dan geser kecil dihitung dari id, supaya kartu tidak berubah saat dirender ulang.
  function seed(id) {
    return ((id * 9301 + 49297) % 233280) / 233280;
  }

  function buatKartu(m) {
    const card = document.createElement('article');
    card.className = `kartu warna-${m.color}`;
    if (freshIds.has(m.id)) card.classList.add('baru');
    if (!reduceMotion.matches) {
      const tilt = (seed(m.id) * 6 - 3).toFixed(2);
      const shift = Math.round((seed(m.id + 7) - 0.5) * 8);
      card.style.transform = `translateY(${shift}px) rotate(${tilt}deg)`;
    }
    const teks = document.createElement('p');
    teks.className = 'pesan';
    teks.textContent = m.message;
    const nama = document.createElement('p');
    nama.className = 'nama';
    nama.textContent = `- ${m.name || 'Anonim'}`;
    card.append(teks, nama);
    return card;
  }

  function tampilkanHalaman(p) {
    const id = ++renderId;
    const ganti = () => {
      if (id !== renderId) return; // digantikan render yang lebih baru
      const total = jumlahHalaman(messages.length);
      const slice = messages.slice(p * PAGE_SIZE, p * PAGE_SIZE + PAGE_SIZE);
      papan.replaceChildren(...slice.map(buatKartu));
      halaman.textContent = total > 1 ? `Halaman ${p + 1}/${total}` : '';
      kosong.hidden = messages.length > 0;
      papan.classList.remove('keluar');
    };
    if (reduceMotion.matches || papan.childElementCount === 0) {
      ganti();
      return;
    }
    papan.classList.add('keluar');
    setTimeout(ganti, FADE_MS);
  }

  // Dipanggil tiap detik. Tidak pernah me-reset rotasi, hanya menampilkan halaman yang seharusnya.
  function tick() {
    const now = Date.now();
    if (detour && now >= detour.sampai) detour = null;
    const p = halamanTampil(now, jumlahHalaman(messages.length), detour);
    if (p !== shown) {
      shown = p;
      tampilkanHalaman(p);
    }
  }

  // Data berubah: render ulang halaman yang sedang tampil.
  function segarkan() {
    shown = -1;
    tick();
  }

  function urutkan(list) {
    return list.sort((a, b) => b.created_at - a.created_at || b.id - a.id);
  }

  function perbaruiJumlah(total) {
    jumlah.textContent = total > 0 ? `${total} pesan` : 'Belum ada pesan';
  }

  function tampilkanPesanBaru(baru) {
    // Pesan baru ditampilkan di halaman tempatnya berada, selama DETOUR_MS. Rotasi tidak di-reset.
    const posisi = Math.min(...baru.map((m) => messages.indexOf(m)));
    detour = { halaman: Math.floor(posisi / PAGE_SIZE), sampai: Date.now() + DETOUR_MS };
    freshIds = new Set(baru.map((m) => m.id));
    clearTimeout(freshTimer);
    freshTimer = setTimeout(() => {
      freshIds.clear();
      papan.querySelectorAll('.baru').forEach((el) => el.classList.remove('baru'));
    }, FRESH_MS);
    segarkan();
  }

  async function ambil(url) {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  async function tarikPenuh() {
    const data = await ambil('/api/messages?since=0');
    perbaruiJumlah(data.total);
    const sig = data.messages.map((m) => m.id).join(',');
    if (sig === signature) return;
    signature = sig;
    const knownBefore = new Set(messages.map((m) => m.id));
    messages = urutkan(data.messages);
    maxId = messages.reduce((mx, m) => Math.max(mx, m.id), maxId);
    const baru = messages.filter((m) => !knownBefore.has(m.id));
    if (baru.length > 0 && knownBefore.size > 0) tampilkanPesanBaru(baru);
    else segarkan();
  }

  async function poll() {
    polls += 1;
    try {
      const data = await ambil(`/api/messages?since=${maxId}`);
      perbaruiJumlah(data.total);
      // Checksum mendeteksi penambahan, pencabutan, dan penghapusan sekaligus.
      if (data.checksum !== checksum(messages) || polls % FULL_SYNC_EVERY === 0) {
        await tarikPenuh();
      }
    } catch {
      // Gagal sesaat: biarkan tampilan lama, coba lagi di siklus berikutnya.
    }
  }

  // Kursor disembunyikan saat idle supaya tidak mengganggu di proyektor.
  let idleTimer = null;
  function bangun() {
    document.body.classList.remove('sembunyi-kursor');
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => document.body.classList.add('sembunyi-kursor'), IDLE_MS);
  }
  ['mousemove', 'keydown', 'touchstart'].forEach((ev) => {
    document.addEventListener(ev, bangun, { passive: true });
  });
  bangun();

  const tombol = document.getElementById('layar-penuh');
  tombol.addEventListener('click', () => {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      document.documentElement.requestFullscreen().catch(() => {});
    }
  });
  document.addEventListener('fullscreenchange', () => {
    tombol.textContent = document.fullscreenElement ? 'Keluar layar penuh' : 'Layar penuh';
  });

  fetch('/api/config')
    .then((r) => r.json())
    .then((cfg) => {
      document.getElementById('judul').textContent = cfg.eventTitle;
      document.title = cfg.eventTitle;
    })
    .catch(() => {});

  setInterval(tick, TICK_MS);
  tarikPenuh()
    .catch(() => {})
    .finally(() => setInterval(poll, POLL_MS));
})();
