'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Database = require('better-sqlite3');
const { buildApp } = require('../src/app');
const { checksum } = require('../public/wall-logika.js');

function setup({ ipPerJam } = {}) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wog-'));
  const app = buildApp({
    dataDir,
    adminPassword: 'rahasia-panjang',
    cookieSecret: 'rahasia-cookie-panjang',
    eventTitle: 'Uji',
    publicUrl: '',
    ipPerJam,
  });
  app.wogDataDir = dataDir;
  return app;
}

const post = (app, payload, { ip = '10.0.0.1', device = null } = {}) =>
  app.inject({
    method: 'POST',
    url: '/api/messages',
    payload,
    remoteAddress: ip,
    cookies: device ? { device } : undefined,
  });

const uuid = () => crypto.randomUUID();

async function login(app) {
  const res = await app.inject({
    method: 'POST',
    url: '/api/admin/login',
    payload: { password: 'rahasia-panjang' },
  });
  return res.cookies.find((c) => c.name === 'admin').value;
}

async function setStatus(app, admin, id, status) {
  return app.inject({
    method: 'PATCH',
    url: `/api/admin/messages/${id}`,
    cookies: { admin },
    payload: { status },
  });
}

test('honeypot terisi: respons sukses palsu, tidak tersimpan', async () => {
  const app = setup();
  const res = await app.inject({
    method: 'POST',
    url: '/api/messages',
    payload: { message: 'Terima kasih banyak', color: 'mint', website: 'http://spam' },
  });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.json(), { ok: true });
  const list = await app.inject({ method: 'GET', url: '/api/messages?since=0' });
  assert.equal(list.json().total, 0);
  await app.close();
});

test('validasi: pesan pendek dan warna tidak dikenal ditolak', async () => {
  const app = setup();
  const res = await post(app, { message: 'hi', color: 'merah' });
  assert.equal(res.statusCode, 400);
  assert.equal(res.json().errors.message, 'Pesan minimal 3 huruf.');
  assert.ok(res.json().errors.color);
  await app.close();
});

test('rate limit per perangkat: dua pesan dalam 20 detik dari perangkat sama ditolak dengan hitungan detik', async () => {
  const app = setup();
  const device = uuid();
  const payload = { message: 'Terima kasih untuk semuanya', color: 'biru' };
  assert.equal((await post(app, payload, { device })).statusCode, 200);
  const kedua = await post(app, payload, { device });
  assert.equal(kedua.statusCode, 429);
  assert.match(kedua.json().error, /^Tunggu \d+ detik sebelum mengirim pesan lagi\.$/);
  await app.close();
});

test('dua perangkat berbeda di IP yang sama sama-sama bisa mengirim dalam 20 detik yang sama', async () => {
  const app = setup();
  const payload = { message: 'Terima kasih dari meja sebelah', color: 'mint' };
  const a = await post(app, payload, { device: uuid() });
  const b = await post(app, payload, { device: uuid() });
  assert.equal(a.statusCode, 200);
  assert.equal(b.statusCode, 200);
  await app.close();
});

test('tanpa cookie: tidak ada jeda 20 detik, hanya pagar IP per jam', async () => {
  const app = setup({ ipPerJam: 150 });
  const payload = { message: 'Terima kasih untuk hari ini', color: 'peach' };
  for (let i = 0; i < 150; i += 1) {
    assert.equal((await post(app, payload)).statusCode, 200, `pesan ke-${i + 1}`);
  }
  const ke151 = await post(app, payload);
  assert.equal(ke151.statusCode, 429);
  assert.match(ke151.json().error, /Coba lagi dalam \d+ detik\./);
  await app.close();
});

test('GET / memberi cookie device httpOnly SameSite=Lax, dan tidak menggantinya kalau sudah ada', async () => {
  const app = setup();
  const pertama = await app.inject({ method: 'GET', url: '/' });
  assert.equal(pertama.statusCode, 200);
  const cookie = pertama.cookies.find((c) => c.name === 'device');
  assert.ok(cookie, 'cookie device harus ada');
  assert.ok(cookie.httpOnly);
  assert.equal(cookie.sameSite, 'Lax');
  assert.match(cookie.value, /^[0-9a-f-]{36}$/i);

  const kedua = await app.inject({ method: 'GET', url: '/', cookies: { device: cookie.value } });
  assert.equal(kedua.cookies.find((c) => c.name === 'device'), undefined);
  await app.close();
});

test('alur: kirim, admin wajib login, setujui, tampil di publik', async () => {
  const app = setup();
  assert.equal((await post(app, { name: 'Sari', message: 'Terima kasih ya', color: 'peach' })).statusCode, 200);

  const tanpaLogin = await app.inject({ method: 'GET', url: '/api/admin/messages?status=pending' });
  assert.equal(tanpaLogin.statusCode, 401);

  const salah = await app.inject({ method: 'POST', url: '/api/admin/login', payload: { password: 'salah' } });
  assert.equal(salah.statusCode, 401);

  const admin = await login(app);
  const pending = await app.inject({
    method: 'GET',
    url: '/api/admin/messages?status=pending',
    cookies: { admin },
  });
  assert.equal(pending.json().messages.length, 1);
  assert.equal(pending.json().counts.pending, 1);
  const id = pending.json().messages[0].id;
  assert.equal((await setStatus(app, admin, id, 'approved')).statusCode, 200);

  const publik = await app.inject({ method: 'GET', url: '/api/messages?since=0' });
  assert.equal(publik.json().total, 1);
  assert.equal(publik.json().messages[0].name, 'Sari');
  assert.equal(publik.json().messages[0].ip_hash, undefined);
  assert.equal(publik.json().messages[0].device_hash, undefined);
  await app.close();
});

test('checksum berubah saat pesan lama disetujui setelah pesan baru, dicabut, atau dihapus', async () => {
  const app = setup();
  const admin = await login(app);
  const ids = [];
  for (let i = 0; i < 3; i += 1) {
    await post(app, { name: `P${i}`, message: `Ucapan nomor ${i}`, color: 'kuning' }, { device: uuid() });
  }
  const pending = (await app.inject({
    method: 'GET', url: '/api/admin/messages?status=pending', cookies: { admin },
  })).json().messages;
  // Urutan terbaru dulu: pending[2] adalah pesan paling lama (id 1).
  ids.push(pending[2].id, pending[1].id, pending[0].id);

  const sinkron = async () => {
    const res = (await app.inject({ method: 'GET', url: '/api/messages?since=0' })).json();
    return { checksum: res.checksum, list: res.messages };
  };

  await setStatus(app, admin, ids[1], 'approved');
  const a = await sinkron();
  // Setujui yang lebih lama setelah yang lebih baru: id lebih kecil, tetap harus terdeteksi.
  await setStatus(app, admin, ids[0], 'approved');
  const b = await sinkron();
  assert.notEqual(b.checksum, a.checksum);
  assert.equal(b.checksum, checksum(b.list));

  await setStatus(app, admin, ids[0], 'pending');
  const c = await sinkron();
  assert.notEqual(c.checksum, b.checksum);
  assert.equal(c.checksum, checksum(c.list));

  await app.inject({ method: 'DELETE', url: `/api/admin/messages/${ids[1]}`, cookies: { admin } });
  const d = await sinkron();
  assert.notEqual(d.checksum, c.checksum);
  assert.equal(d.checksum, checksum(d.list));
  await app.close();
});

test('/index.html dialihkan ke / sehingga cookie perangkat tetap diberikan', async () => {
  const app = setup();
  const res = await app.inject({ method: 'GET', url: '/index.html' });
  assert.equal(res.statusCode, 301);
  assert.equal(res.headers.location, '/');
  await app.close();
});

test('hapus semua: butuh login, konfirmasi, membuat salinan, mengosongkan tabel, mengubah checksum', async () => {
  const app = setup();
  const admin = await login(app);
  for (let i = 0; i < 3; i += 1) {
    await post(app, { name: `H${i}`, message: `Ucapan untuk dihapus ${i}`, color: 'biru' }, { device: uuid() });
  }
  const pending = (await app.inject({ method: 'GET', url: '/api/admin/messages?status=pending', cookies: { admin } })).json().messages;
  await setStatus(app, admin, pending[0].id, 'approved');
  const sebelum = (await app.inject({ method: 'GET', url: '/api/messages?since=0' })).json().checksum;

  const tanpaLogin = await app.inject({ method: 'DELETE', url: '/api/admin/messages', payload: { konfirmasi: 'HAPUS SEMUA' } });
  assert.equal(tanpaLogin.statusCode, 401);
  const salah = await app.inject({ method: 'DELETE', url: '/api/admin/messages', cookies: { admin }, payload: { konfirmasi: 'hapus' } });
  assert.equal(salah.statusCode, 400);

  const res = await app.inject({ method: 'DELETE', url: '/api/admin/messages', cookies: { admin }, payload: { konfirmasi: 'HAPUS SEMUA' } });
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().jumlah, 3);
  assert.match(res.json().backup, /^backup-.*\.db$/);
  const berkas = res.json().backup;
  const sesudah = (await app.inject({ method: 'GET', url: '/api/messages?since=0' })).json();
  assert.equal(sesudah.total, 0);
  assert.equal(sesudah.checksum, '0:0');
  assert.notEqual(sesudah.checksum, sebelum);
  const kosong = await app.inject({ method: 'GET', url: '/api/admin/messages?status=pending', cookies: { admin } });
  assert.equal(kosong.json().counts.pending + kosong.json().counts.approved + kosong.json().counts.rejected, 0);
  const salinan = new Database(path.join(app.wogDataDir, berkas), { readonly: true });
  assert.equal(salinan.prepare('SELECT COUNT(*) AS n FROM messages').get().n, 3, 'salinan harus memuat 3 pesan');
  salinan.close();
  await app.close();
});

test('healthz dan header keamanan', async () => {
  const app = setup();
  const res = await app.inject({ method: 'GET', url: '/healthz' });
  assert.deepEqual(res.json(), { ok: true });
  assert.equal(res.headers['x-content-type-options'], 'nosniff');
  assert.equal(res.headers['x-frame-options'], 'DENY');
  await app.close();
});

test('setujui semua: POST tanpa isi tapi Content-Type JSON (seperti admin.js) tetap berhasil', async () => {
  const app = setup();
  const admin = await login(app);
  await post(app, { name: 'A', message: 'Ucapan menunggu untuk disetujui', color: 'biru' }, { device: uuid() });
  const res = await app.inject({
    method: 'POST',
    url: '/api/admin/approve-all',
    cookies: { admin },
    headers: { 'content-type': 'application/json' },
  });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.json(), { ok: true, count: 1 });
});
