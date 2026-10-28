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
  const AUTO_DURASI_MS = 5 * 60 * 1000;
  const AUTO_JEDA_MS = 10 * 1000;
  let autoTimer = null;
  let autoHitung = null;
  let autoBerakhir = 0;

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
      if (autoTimer !== null) hentikanAuto('Auto approve berhenti karena pindah tab.');
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

  // Auto approve hanya hidup di memori tab ini: reload atau tutup tab langsung mematikannya.
  const tombolAuto = document.getElementById('auto-approve');

  function hentikanAuto(pesan) {
    clearTimeout(autoTimer);
    clearInterval(autoHitung);
    autoTimer = null;
    autoHitung = null;
    tombolAuto.textContent = 'Auto approve 5 menit';
    tombolAuto.classList.remove('aktif');
    tombolAuto.setAttribute('aria-pressed', 'false');
    beriStatus(pesan);
  }

  function perbaruiHitungAuto() {
    const sisa = autoBerakhir - Date.now();
    if (sisa <= 0) return hentikanAuto('Auto approve sudah mati: waktu 5 menit habis.');
    const detik = Math.ceil(sisa / 1000);
    const menit = Math.floor(detik / 60);
    tombolAuto.textContent = `Auto approve aktif - berhenti dalam ${menit}:${String(detik % 60).padStart(2, '0')}`;
  }

  async function putaranAuto() {
    try {
      const data = await api('/api/admin/approve-all', { method: 'POST' });
      if (autoTimer === null) return;
      if (data.count > 0) {
        beriStatus(`Auto approve: ${data.count} ucapan disetujui.`);
        await muat();
      } else {
        beriStatus('Auto approve aktif. Belum ada ucapan baru.');
      }
    } catch (err) {
      if (autoTimer === null) return;
      if (err instanceof SesiHabis) {
        hentikanAuto('Auto approve sudah mati: sesi admin habis. Masuk lagi.');
        return tampilkanLogin();
      }
      beriStatus(`Peringatan: auto approve gagal (${err.message}). Dicoba lagi dalam 10 detik.`);
    }
    if (autoTimer === null) return;
    autoTimer = setTimeout(putaranAuto, AUTO_JEDA_MS);
  }

  function mulaiAuto() {
    autoBerakhir = Date.now() + AUTO_DURASI_MS;
    tombolAuto.classList.add('aktif');
    tombolAuto.setAttribute('aria-pressed', 'true');
    autoHitung = setInterval(perbaruiHitungAuto, 1000);
    perbaruiHitungAuto();
    beriStatus('Auto approve aktif: ucapan menunggu disetujui tiap 10 detik.');
    autoTimer = setTimeout(putaranAuto, 0);
  }

  tombolAuto.addEventListener('click', () => {
    if (autoTimer === null) return mulaiAuto();
    hentikanAuto('Auto approve dihentikan manual. Auto approve sekarang mati.');
  });

  // Pindah tab browser juga menghentikan auto approve, supaya tidak berjalan tanpa tombol.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && autoTimer !== null) hentikanAuto('Auto approve berhenti karena pindah tab.');
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

  // Hapus semua: dua langkah. Tombol aktif hanya setelah HAPUS SEMUA diketik persis.
  const ketikHapus = document.getElementById('ketik-hapus');
  const tombolHapus = document.getElementById('hapus-semua');
  ketikHapus.addEventListener('input', () => {
    tombolHapus.disabled = ketikHapus.value !== 'HAPUS SEMUA';
  });
  tombolHapus.addEventListener('click', async () => {
    tombolHapus.disabled = true;
    const hasil = document.getElementById('hasil-hapus');
    try {
      const data = await api('/api/admin/messages', { method: 'DELETE', body: { konfirmasi: 'HAPUS SEMUA' } });
      hasil.textContent = `${data.jumlah} ucapan dihapus. Salinan database: ${data.backup} (ada di folder data).`;
      ketikHapus.value = '';
      await muat();
    } catch (err) {
      if (err instanceof SesiHabis) return tampilkanLogin();
      hasil.textContent = err.message;
      tombolHapus.disabled = ketikHapus.value !== 'HAPUS SEMUA';
    }
  });

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
