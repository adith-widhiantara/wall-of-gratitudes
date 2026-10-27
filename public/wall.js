(() => {
  'use strict';

  const PAGE_SIZE = 12;
  const ROTATE_MS = 15000;
  const POLL_MS = 5000;
  const FULL_SYNC_EVERY = 12; // sekitar 60 detik, menangkap pesan yang dihapus atau dicabut
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
  let page = 0;
  let polls = 0;
  let rotateTimer = null;
  let freshIds = new Set();
  let freshTimer = null;

  // Kemiringan dan geser kecil dihitung dari id, supaya kartu tidak berubah saat dirender ulang.
  function seed(id) {
    return ((id * 9301 + 49297) % 233280) / 233280;
  }

  function pageCount() {
    return Math.max(1, Math.ceil(messages.length / PAGE_SIZE));
  }

  function buatKartu(m) {
    const card = document.createElement('article');
    card.className = `kartu warna-${m.color}`;
    if (freshIds.has(m.id)) card.classList.add('baru');
    if (!reduceMotion.matches) {
      const s = seed(m.id);
      const tilt = (s * 6 - 3).toFixed(2);
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

  function tampilkanHalaman() {
    const total = pageCount();
    if (page >= total) page = 0;
    const slice = messages.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);
    const ganti = () => {
      papan.replaceChildren(...slice.map(buatKartu));
      halaman.textContent = total > 1 ? `Halaman ${page + 1}/${total}` : '';
      kosong.hidden = messages.length > 0;
    };
    if (reduceMotion.matches || papan.childElementCount === 0) {
      ganti();
      papan.classList.remove('keluar');
      return;
    }
    papan.classList.add('keluar');
    setTimeout(() => {
      ganti();
      papan.classList.remove('keluar');
    }, FADE_MS);
  }

  function mulaiRotasi() {
    clearInterval(rotateTimer);
    rotateTimer = setInterval(() => {
      if (pageCount() < 2) return;
      page = (page + 1) % pageCount();
      tampilkanHalaman();
    }, ROTATE_MS);
  }

  function urutkan(list) {
    return list.sort((a, b) => b.created_at - a.created_at || b.id - a.id);
  }

  function perbaruiJumlah(total) {
    jumlah.textContent = total > 0 ? `${total} pesan` : 'Belum ada pesan';
  }

  function tampilkanPesanBaru(baru) {
    // Pesan baru langsung ke halaman pertama, supaya penonton melihatnya segera.
    page = 0;
    freshIds = new Set(baru.map((m) => m.id));
    tampilkanHalaman();
    mulaiRotasi();
    clearTimeout(freshTimer);
    freshTimer = setTimeout(() => {
      freshIds.clear();
      papan.querySelectorAll('.baru').forEach((el) => el.classList.remove('baru'));
    }, FRESH_MS);
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
    else tampilkanHalaman();
  }

  async function tarikBaru() {
    const data = await ambil(`/api/messages?since=${maxId}`);
    perbaruiJumlah(data.total);
    if (data.messages.length === 0) return;
    const existing = new Set(messages.map((m) => m.id));
    const baru = data.messages.filter((m) => !existing.has(m.id));
    if (baru.length === 0) return;
    messages = urutkan(messages.concat(baru));
    maxId = data.messages.reduce((mx, m) => Math.max(mx, m.id), maxId);
    signature = messages.map((m) => m.id).join(',');
    tampilkanPesanBaru(baru);
  }

  async function poll() {
    polls += 1;
    try {
      if (polls % FULL_SYNC_EVERY === 0) await tarikPenuh();
      else await tarikBaru();
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

  tarikPenuh()
    .catch(() => {})
    .finally(() => {
      mulaiRotasi();
      setInterval(poll, POLL_MS);
    });
})();
