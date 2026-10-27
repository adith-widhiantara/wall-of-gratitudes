(() => {
  'use strict';

  const MAX = 280;
  const WARN_FROM = 240;
  const WARNA = ['kuning', 'mint', 'biru', 'peach', 'mawar', 'lavender'];
  const FIELD_ERR = { name: 'err-name', message: 'err-message', color: 'err-color' };

  const form = document.getElementById('form');
  const nama = document.getElementById('nama');
  const pesan = document.getElementById('pesan');
  const hitung = document.getElementById('hitung');
  const kirim = document.getElementById('kirim');
  const umum = document.getElementById('err-umum');
  const sukses = document.getElementById('sukses');

  function setErr(id, text) {
    const el = document.getElementById(id);
    el.textContent = text || '';
    el.hidden = !text;
  }

  function bersihkanError() {
    Object.values(FIELD_ERR).forEach((id) => setErr(id, ''));
    setErr('err-umum', '');
  }

  function perbaruiHitung() {
    const n = pesan.value.length;
    hitung.textContent = `${n}/${MAX}`;
    hitung.classList.toggle('hitung-peringatan', n > WARN_FROM && n < MAX);
    hitung.classList.toggle('hitung-batas', n >= MAX);
  }

  function pilihWarnaAcak() {
    const i = Math.floor(Math.random() * WARNA.length);
    form.elements.color.forEach((radio) => { radio.checked = radio.value === WARNA[i]; });
  }

  function ambilData() {
    const checked = form.querySelector('input[name="color"]:checked');
    return {
      name: nama.value,
      message: pesan.value,
      color: checked ? checked.value : '',
      website: document.getElementById('website').value,
    };
  }

  function validasi(data) {
    const errors = {};
    if (data.message.trim().length < 3) errors.message = 'Pesan minimal 3 huruf.';
    if (!data.color) errors.color = 'Pilih warna kertas dulu.';
    return errors;
  }

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    bersihkanError();
    const data = ambilData();
    const errors = validasi(data);
    for (const [key, text] of Object.entries(errors)) setErr(FIELD_ERR[key], text);
    if (Object.keys(errors).length > 0) {
      (errors.message ? pesan : form.querySelector('input[name="color"]')).focus();
      return;
    }

    kirim.disabled = true;
    try {
      const res = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok && body.ok) {
        form.hidden = true;
        sukses.hidden = false;
        sukses.focus();
        return;
      }
      if (body.errors) {
        for (const [key, text] of Object.entries(body.errors)) setErr(FIELD_ERR[key], text);
      } else {
        setErr('err-umum', body.error || 'Pesan belum terkirim. Coba lagi sebentar.');
      }
    } catch {
      setErr('err-umum', 'Gagal mengirim. Periksa koneksi lalu coba lagi.');
    } finally {
      kirim.disabled = false;
    }
  });

  document.getElementById('kirim-lagi').addEventListener('click', () => {
    form.reset();
    bersihkanError();
    perbaruiHitung();
    pilihWarnaAcak();
    sukses.hidden = true;
    form.hidden = false;
    nama.focus();
  });

  pesan.addEventListener('input', perbaruiHitung);

  fetch('/api/config')
    .then((r) => r.json())
    .then((cfg) => {
      document.getElementById('judul').textContent = cfg.eventTitle;
      document.title = cfg.eventTitle;
    })
    .catch(() => {});

  perbaruiHitung();
  pilihWarnaAcak();
})();
