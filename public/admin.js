(() => {
  'use strict';

  const STORAGE_KEY = 'wog-admin';
  const L = window.WallLogika;
  const LABEL_KOSONG = {
    pending: 'Tidak ada ucapan yang menunggu.',
    approved: 'Belum ada ucapan yang disetujui.',
    rejected: 'Tidak ada ucapan yang ditolak.',
  };

  const masuk = document.getElementById('masuk');
  const panel = document.getElementById('panel');
  const formMasuk = document.getElementById('form-masuk');
  const daftar = document.getElementById('daftar');
  const kosong = document.getElementById('kosong');
  const statusEl = document.getElementById('status');
  const aksiMassal = document.getElementById('aksi-massal');

  let status = 'pending';
  let settings = L.pengaturanAdmin({});
  let refreshTimer = null;
  let items = [];
  let counts = { pending: 0, approved: 0, rejected: 0 };

  class SesiHabis extends Error {}

  async function api(url, options = {}) {
    const res = await fetch(url, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
    const body = await res.json().catch(() => ({}));
    if (res.status === 401 && url !== '/api/admin/login') throw new SesiHabis();
    if (!res.ok) throw new Error(body.error || 'Terjadi kesalahan. Coba lagi.');
    return body;
  }

  function tampilkanLogin() {
    panel.hidden = true;
    masuk.hidden = false;
    document.getElementById('password').focus();
  }

  function tampilkanPanel() {
    masuk.hidden = true;
    panel.hidden = false;
  }

  function beriStatus(text) {
    statusEl.textContent = text;
  }

  function waktuRelatif(ts) {
    const detik = Math.floor((Date.now() - ts) / 1000);
    if (detik < 60) return 'baru saja';
    const menit = Math.floor(detik / 60);
    if (menit < 60) return `${menit} menit lalu`;
    const jam = Math.floor(menit / 60);
    if (jam < 24) return `${jam} jam lalu`;
    return `${Math.floor(jam / 24)} hari lalu`;
  }

  function perbaruiHitungTab() {
    for (const key of Object.keys(counts)) {
      document.getElementById(`n-${key}`).textContent = counts[key];
    }
    aksiMassal.hidden = status !== 'pending';
  }

  function tombol(label, kelas, onClick) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = kelas;
    btn.textContent = label;
    btn.addEventListener('click', onClick);
    return btn;
  }

  function buatItem(m) {
    const li = document.createElement('li');
    li.className = 'item';
    const pesan = document.createElement('p');
    pesan.className = 'item-pesan';
    pesan.textContent = m.message;
    const meta = document.createElement('p');
    meta.className = 'item-meta';
    meta.textContent = `${m.name || 'Anonim'} · ${waktuRelatif(m.created_at)}`;
    const aksi = document.createElement('div');
    aksi.className = 'item-aksi';

    if (m.status === 'pending') {
      aksi.append(
        tombol('Setujui', 'tombol-utama', () => ubahStatus(m, 'approved', 'Ucapan disetujui.')),
        tombol('Tolak', 'tombol-bahaya', () => ubahStatus(m, 'rejected', 'Ucapan ditolak.')),
      );
    } else if (m.status === 'approved') {
      aksi.append(
        tombol('Batalkan persetujuan', 'tombol-sekunder', () => ubahStatus(m, 'pending', 'Persetujuan dibatalkan.')),
        tombol('Hapus permanen', 'tombol-bahaya', () => hapus(m)),
      );
    } else {
      aksi.append(
        tombol('Setujui', 'tombol-utama', () => ubahStatus(m, 'approved', 'Ucapan disetujui.')),
        tombol('Hapus permanen', 'tombol-bahaya', () => hapus(m)),
      );
    }
    li.append(pesan, meta, aksi);
    return li;
  }

  function render() {
    daftar.replaceChildren(...items.map(buatItem));
    kosong.hidden = items.length > 0;
    kosong.textContent = LABEL_KOSONG[status];
    perbaruiHitungTab();
  }

  async function muat() {
    try {
      const data = await api(`/api/admin/messages?status=${status}`);
      items = data.messages;
      counts = data.counts;
      render();
    } catch (err) {
      if (err instanceof SesiHabis) return tampilkanLogin();
      beriStatus(err.message);
    }
  }

  function tampilkanOptimis(m, perubahan, pesanSukses) {
    counts[m.status] -= 1;
    if (perubahan) counts[perubahan] += 1;
    items = items.filter((x) => x.id !== m.id);
    render();
    beriStatus(pesanSukses);
  }

  async function ubahStatus(m, baru, pesanSukses) {
    tampilkanOptimis(m, baru, pesanSukses);
    try {
      await api(`/api/admin/messages/${m.id}`, { method: 'PATCH', body: { status: baru } });
    } catch (err) {
      if (err instanceof SesiHabis) return tampilkanLogin();
      beriStatus(err.message);
      muat();
    }
  }

  async function hapus(m) {
    if (!window.confirm('Hapus permanen ucapan ini? Tindakan ini tidak bisa dibatalkan.')) return;
    tampilkanOptimis(m, null, 'Ucapan dihapus.');
    try {
      await api(`/api/admin/messages/${m.id}`, { method: 'DELETE' });
    } catch (err) {
      if (err instanceof SesiHabis) return tampilkanLogin();
      beriStatus(err.message);
      muat();
    }
  }

  document.querySelectorAll('.tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      status = btn.dataset.status;
      document.querySelectorAll('.tab').forEach((t) => {
        t.setAttribute('aria-pressed', String(t === btn));
      });
      beriStatus('');
      muat();
    });
  });

  document.getElementById('setujui-semua').addEventListener('click', async () => {
    const n = counts.pending;
    if (n === 0) return beriStatus('Tidak ada ucapan yang menunggu.');
    if (!window.confirm(`Setujui ${n} ucapan yang menunggu? Semuanya akan langsung tampil di layar.`)) return;
    try {
      const data = await api('/api/admin/approve-all', { method: 'POST' });
      beriStatus(`${data.count} ucapan disetujui.`);
      await muat();
    } catch (err) {
      if (err instanceof SesiHabis) return tampilkanLogin();
      beriStatus(err.message);
    }
  });

  document.getElementById('keluar').addEventListener('click', async () => {
    await api('/api/admin/logout', { method: 'POST' }).catch(() => {});
    tampilkanLogin();
  });

  formMasuk.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const errEl = document.getElementById('err-masuk');
    const password = document.getElementById('password').value;
    errEl.hidden = true;
    if (!password) {
      errEl.textContent = 'Isi password dulu.';
      errEl.hidden = false;
      return;
    }
    try {
      await api('/api/admin/login', { method: 'POST', body: { password } });
      document.getElementById('password').value = '';
      tampilkanPanel();
      await muat();
    } catch (err) {
      errEl.textContent = err.message;
      errEl.hidden = false;
    }
  });

  // Satu interval saja. Setiap perubahan jeda membatalkan yang lama. Mode mati tidak memasang interval.
  function mulaiRefresh() {
    clearInterval(refreshTimer);
    refreshTimer = null;
    const mati = settings.refresh === 'mati';
    document.getElementById('muat-ulang').hidden = !mati;
    if (mati) return;
    refreshTimer = setInterval(() => {
      if (!panel.hidden && status === 'pending') muat();
    }, settings.refresh * 1000);
  }

  function bacaSimpanan() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
    } catch {
      return {};
    }
  }

  function simpanSettings() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // Penyimpanan diblokir: pengaturan tetap berlaku untuk sesi ini.
    }
  }

  const jedaInput = document.getElementById('jeda-admin');
  const matiInput = document.getElementById('mati-admin');
  const jedaOutput = document.getElementById('out-jeda-admin');

  function tampilkanSettings() {
    const mati = settings.refresh === 'mati';
    matiInput.checked = mati;
    jedaInput.disabled = mati;
    const nilai = mati ? L.BAWAAN_ADMIN_REFRESH : settings.refresh;
    jedaInput.value = nilai;
    jedaOutput.textContent = mati ? 'mati' : `${nilai} detik`;
  }

  jedaInput.addEventListener('input', () => {
    settings = { refresh: Number(jedaInput.value) };
    tampilkanSettings();
    simpanSettings();
    mulaiRefresh();
  });
  matiInput.addEventListener('change', () => {
    settings = matiInput.checked ? { refresh: 'mati' } : { refresh: L.BAWAAN_ADMIN_REFRESH };
    tampilkanSettings();
    simpanSettings();
    mulaiRefresh();
  });
  document.getElementById('muat-ulang').addEventListener('click', () => muat());

  settings = L.pengaturanAdmin(bacaSimpanan());
  tampilkanSettings();
  mulaiRefresh();

  api('/api/admin/messages?status=pending')
    .then((data) => {
      items = data.messages;
      counts = data.counts;
      tampilkanPanel();
      render();
    })
    .catch(() => tampilkanLogin());
})();
