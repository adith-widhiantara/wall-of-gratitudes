(() => {
  'use strict';

  const L = window.WallLogika;
  const STORAGE_KEY = 'wog-wall';
  const TICK_MS = 1000;
  const FULL_SYNC_EVERY = 12; // jaring pengaman berkala, sekitar 60 detik pada jeda 5 detik
  const IDLE_MS = 3000;
  const FADE_MS = 400;
  const QR_CLASSES = ['qr-kanan-bawah', 'qr-kanan-atas', 'qr-kiri-atas', 'qr-kiri-bawah', 'qr-sembunyikan'];

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const body = document.body;
  const area = document.querySelector('.area-papan');
  const papan = document.getElementById('papan');
  const kosong = document.getElementById('kosong');
  const halaman = document.getElementById('halaman');
  const jumlah = document.getElementById('jumlah');
  const qrImg = document.getElementById('qr');
  const panel = document.getElementById('panel');
  const bukaPengaturan = document.getElementById('buka-pengaturan');
  const tombolFull = document.getElementById('layar-penuh');
  const inputUkuran = document.getElementById('ukuran-qr');
  const inputRefresh = document.getElementById('jeda-refresh');
  const inputRotasi = document.getElementById('jeda-rotasi');

  let messages = []; // approved, terbaru dulu
  let signature = '';
  let maxId = 0;
  let polls = 0;
  let pages = []; // hasil paginasLayout, hanya bergantung pada daftar pesan
  let rot = null; // state rotasi, lihat wall-logika.js
  let detour = null; // { halaman, sampai } untuk selingan pesan baru
  let sel = { terakhir: null }; // penjadwal selingan
  let antrean = []; // id pesan baru yang belum pernah tampil sebagai selingan
  let belumTampil = new Set(); // id pesan baru yang belum pernah dirender
  let freshUntil = new Map(); // id -> waktu berakhirnya penanda .baru
  let shown = -1;
  let renderId = 0;
  let settings = L.pengaturanWall({}, {});
  let pollTimer = null;

  // ---------- Pengaturan ----------

  function bacaTersimpan() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
    } catch {
      return {};
    }
  }

  function simpanPengaturan(s) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    } catch {
      // Penyimpanan diblokir: pengaturan tetap berlaku untuk sesi ini.
    }
  }

  function bacaQuery() {
    const p = new URLSearchParams(location.search);
    const q = {};
    for (const k of ['qr', 'qr-ukuran', 'refresh', 'rotasi']) {
      if (p.has(k)) q[k] = p.get(k);
    }
    return q;
  }

  function terapkanQr(s) {
    body.classList.remove(...QR_CLASSES);
    body.classList.add(`qr-${s.qr}`);
    document.documentElement.style.setProperty('--qr', `${s.qrUkuran}px`);
    qrImg.width = s.qrUkuran;
    qrImg.height = s.qrUkuran;
  }

  function mulaiPoll() {
    clearInterval(pollTimer); // satu interval saja, tidak pernah dua
    pollTimer = setInterval(poll, settings.refresh * 1000);
  }

  function perbaruiOutput() {
    document.getElementById('out-ukuran-qr').textContent = `${settings.qrUkuran} px`;
    document.getElementById('out-jeda-refresh').textContent = `${settings.refresh} detik`;
    document.getElementById('out-jeda-rotasi').textContent = `${settings.rotasi} detik`;
    inputUkuran.value = settings.qrUkuran;
    inputRefresh.value = settings.refresh;
    inputRotasi.value = settings.rotasi;
    const qrRadio = document.querySelector(`input[name="qr"][value="${settings.qr}"]`);
    if (qrRadio) qrRadio.checked = true;
  }

  // Semua perubahan pengaturan lewat sini. Timer lama dibatalkan dulu sebelum yang baru dipasang,
  // dan posisi rotasi tidak di-reset ke halaman 1.
  function terapkan(baru) {
    const lama = settings;
    settings = baru;
    terapkanQr(settings);
    if (lama.rotasi !== settings.rotasi) {
      rot = L.gantiJeda(rot, Date.now(), L.jumlahHalaman(pages), settings.rotasi * 1000);
    }
    if (lama.refresh !== settings.refresh) mulaiPoll();
    perbaruiOutput();
    simpanPengaturan(settings);
  }

  function bukaPanel() {
    panel.hidden = false;
    bukaPengaturan.setAttribute('aria-expanded', 'true');
    panel.querySelector('input').focus();
  }

  function tutupPanel() {
    panel.hidden = true;
    bukaPengaturan.setAttribute('aria-expanded', 'false');
    bukaPengaturan.focus();
  }

  bukaPengaturan.addEventListener('click', () => {
    if (panel.hidden) bukaPanel();
    else tutupPanel();
  });
  document.getElementById('tutup-panel').addEventListener('click', tutupPanel);
  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape' && !panel.hidden) tutupPanel();
  });

  document.querySelectorAll('input[name="qr"]').forEach((radio) => {
    radio.addEventListener('change', () => {
      if (radio.checked) terapkan({ ...settings, qr: radio.value });
    });
  });
  inputUkuran.addEventListener('input', () => terapkan({ ...settings, qrUkuran: Number(inputUkuran.value) }));
  inputRefresh.addEventListener('input', () => terapkan({ ...settings, refresh: Number(inputRefresh.value) }));
  inputRotasi.addEventListener('input', () => terapkan({ ...settings, rotasi: Number(inputRotasi.value) }));
  document.getElementById('kembali-bawaan').addEventListener('click', () => {
    terapkan(L.pengaturanWall({}, {}));
  });

  // ---------- Layout ----------

  function kartuKosong(pl) {
    const card = document.createElement('article');
    card.className = `kartu warna-${pl.m.color}`;
    card.dataset.id = String(pl.m.id);
    if (belumTampil.has(pl.m.id)) {
      belumTampil.delete(pl.m.id);
      freshUntil.set(pl.m.id, Date.now() + L.DETOUR_MS);
    }
    if ((freshUntil.get(pl.m.id) || 0) > Date.now()) card.classList.add('baru');
    card.style.gridColumn = `${pl.col + 1} / span ${pl.cs}`;
    card.style.gridRow = `${pl.row + 1} / span ${pl.rs}`;
    card.style.zIndex = String(pl.z);
    card.style.transform = `translate(${pl.dx.toFixed(2)}px, ${pl.dy.toFixed(2)}px) rotate(${pl.rot.toFixed(2)}deg)`;
    const teks = document.createElement('p');
    teks.className = 'pesan';
    teks.textContent = pl.m.message;
    const nama = document.createElement('p');
    nama.className = 'nama';
    nama.textContent = `- ${pl.m.name || 'Anonim'}`;
    card.append(teks, nama);
    return card;
  }

  // Kanvas logis tetap (DESIGN_W x DESIGN_H). Grid papan dan pembagian halaman tidak bergantung layar.
  function aturKanvas() {
    const C = L.jumlahKolom(L.DESIGN_W);
    const R = L.jumlahBaris(L.DESIGN_H);
    const cellW = (L.DESIGN_W - (C - 1) * L.GAP) / C;
    papan.style.width = `${L.DESIGN_W}px`;
    papan.style.height = `${L.DESIGN_H}px`;
    papan.style.gridTemplateColumns = `repeat(${C}, ${cellW}px)`;
    papan.style.gridTemplateRows = `repeat(${R}, ${L.ROW_UNIT}px)`;
  }

  // Kanvas diperbesar atau diperkecil agar muat di area, di tengah. Tidak mengubah pembagian halaman.
  function aturSkala() {
    const { s, x, y } = L.skalaKanvas(area.clientWidth, area.clientHeight);
    papan.style.transform = `translate(${x}px, ${y}px) scale(${s})`;
  }

  function hitungUlang() {
    pages = L.paginasLayout(messages);
  }

  function tampilkanHalaman(p) {
    const id = ++renderId;
    const ganti = () => {
      if (id !== renderId) return; // digantikan render yang lebih baru
      const page = pages[p] || [];
      papan.replaceChildren(...page.map(kartuKosong));
      halaman.textContent = pages.length > 1 ? `Halaman ${p + 1}/${pages.length}` : '';
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
    if (antrean.length > 0) {
      const terbaru = Math.max(...antrean); // id naik seiring waktu, jadi id terbesar paling baru
      const r = L.jadwalSelingan(sel, now, antrean, terbaru);
      sel = r.sel;
      if (r.mulai) mulaiSelingan(now, terbaru);
    }
    const p = L.halamanTampil(now, L.jumlahHalaman(pages), detour, rot);
    if (p !== shown) {
      shown = p;
      tampilkanHalaman(p);
    }
    papan.querySelectorAll('.baru').forEach((el) => {
      if ((freshUntil.get(Number(el.dataset.id)) || 0) <= now) el.classList.remove('baru');
    });
  }

  // Satu selingan untuk semua pesan yang menumpuk. Halaman yang dipilih adalah halaman pesan terbaru.
  function mulaiSelingan(now, terbaru) {
    const p = pages.findIndex((page) => page.some((pl) => pl.m.id === terbaru));
    const sampai = now + L.DETOUR_MS;
    for (const id of antrean) freshUntil.set(id, Math.max(freshUntil.get(id) || 0, sampai));
    antrean = [];
    detour = { halaman: Math.max(0, p), sampai };
  }

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

  // Pesan baru hanya masuk antrean. Selingan dijadwalkan oleh tick(), paling banyak satu per 90 detik.
  function catatPesanBaru(baru) {
    for (const m of baru) {
      antrean.push(m.id);
      belumTampil.add(m.id);
    }
  }

  // ---------- Data ----------

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
    const ada = new Set(messages.map((m) => m.id));
    antrean = antrean.filter((id) => ada.has(id)); // pesan yang sudah dicabut tidak perlu selingan
    const baru = messages.filter((m) => !knownBefore.has(m.id));
    if (baru.length > 0 && knownBefore.size > 0) catatPesanBaru(baru);
    hitungUlang();
    segarkan();
  }

  async function poll() {
    polls += 1;
    try {
      const data = await ambil(`/api/messages?since=${maxId}`);
      perbaruiJumlah(data.total);
      // Checksum mendeteksi penambahan, pencabutan, dan penghapusan sekaligus.
      if (data.checksum !== L.checksum(messages) || polls % FULL_SYNC_EVERY === 0) {
        await tarikPenuh();
      }
    } catch {
      // Gagal sesaat: biarkan tampilan lama, coba lagi di siklus berikutnya.
    }
  }

  // ---------- Kursor dan kontrol idle ----------

  let idleTimer = null;
  function bangun() {
    body.classList.remove('sembunyi-kursor', 'sembunyi-kontrol');
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      // Panel yang sedang terbuka tidak disembunyikan, supaya tidak hilang saat sedang diatur.
      body.classList.add('sembunyi-kursor');
      if (panel.hidden) body.classList.add('sembunyi-kontrol');
    }, IDLE_MS);
  }
  ['mousemove', 'keydown', 'touchstart'].forEach((ev) => {
    document.addEventListener(ev, bangun, { passive: true });
  });

  tombolFull.addEventListener('click', () => {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      document.documentElement.requestFullscreen().catch(() => {});
    }
  });
  document.addEventListener('fullscreenchange', () => {
    tombolFull.textContent = document.fullscreenElement ? 'Keluar layar penuh' : 'Layar penuh';
  });

  // ---------- Start ----------

  settings = L.pengaturanWall(bacaTersimpan(), bacaQuery());
  if (Object.keys(bacaQuery()).length > 0) simpanPengaturan(settings); // parameter URL ikut tersimpan
  terapkanQr(settings);
  perbaruiOutput();
  rot = L.rotasiAwal(Date.now(), settings.rotasi * 1000);
  aturKanvas();
  aturSkala();
  bangun();

  new ResizeObserver(aturSkala).observe(area);

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
    .finally(() => mulaiPoll());
})();
