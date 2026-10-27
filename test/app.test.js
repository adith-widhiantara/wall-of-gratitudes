'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { buildApp } = require('../src/app');

function setup() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wog-'));
  const app = buildApp({
    dataDir,
    adminPassword: 'rahasia-panjang',
    cookieSecret: 'rahasia-cookie-panjang',
    eventTitle: 'Uji',
    publicUrl: '',
  });
  return { app, dataDir };
}

const post = (app, payload, ip = '10.0.0.1') =>
  app.inject({ method: 'POST', url: '/api/messages', payload, remoteAddress: ip });

test('honeypot terisi: respons sukses palsu, tidak tersimpan', async () => {
  const { app } = setup();
  const res = await post(app, { message: 'Terima kasih banyak', color: 'mint', website: 'http://spam' });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.json(), { ok: true });
  const list = await app.inject({ method: 'GET', url: '/api/messages?since=0' });
  assert.equal(list.json().total, 0);
  await app.close();
});

test('validasi: pesan pendek dan warna tidak dikenal ditolak', async () => {
  const { app } = setup();
  const res = await post(app, { message: 'hi', color: 'merah' });
  assert.equal(res.statusCode, 400);
  assert.equal(res.json().errors.message, 'Pesan minimal 3 huruf.');
  assert.ok(res.json().errors.color);
  await app.close();
});

test('rate limit: dua pesan dalam 20 detik dari IP sama ditolak', async () => {
  const { app } = setup();
  const payload = { message: 'Terima kasih untuk semuanya', color: 'biru' };
  assert.equal((await post(app, payload)).statusCode, 200);
  const second = await post(app, payload);
  assert.equal(second.statusCode, 429);
  assert.match(second.json().error, /20 detik/);
  await app.close();
});

test('alur: kirim, admin wajib login, setujui, tampil di publik', async () => {
  const { app } = setup();
  assert.equal((await post(app, { name: 'Sari', message: 'Terima kasih ya', color: 'peach' })).statusCode, 200);

  const tanpaLogin = await app.inject({ method: 'GET', url: '/api/admin/messages?status=pending' });
  assert.equal(tanpaLogin.statusCode, 401);

  const salah = await app.inject({ method: 'POST', url: '/api/admin/login', payload: { password: 'salah' } });
  assert.equal(salah.statusCode, 401);

  const login = await app.inject({
    method: 'POST',
    url: '/api/admin/login',
    payload: { password: 'rahasia-panjang' },
  });
  assert.equal(login.statusCode, 200);
  const cookie = login.cookies.find((c) => c.name === 'admin');
  assert.ok(cookie.httpOnly);

  const pending = await app.inject({
    method: 'GET',
    url: '/api/admin/messages?status=pending',
    cookies: { admin: cookie.value },
  });
  assert.equal(pending.json().messages.length, 1);
  assert.equal(pending.json().counts.pending, 1);
  const id = pending.json().messages[0].id;

  const approve = await app.inject({
    method: 'PATCH',
    url: `/api/admin/messages/${id}`,
    cookies: { admin: cookie.value },
    payload: { status: 'approved' },
  });
  assert.equal(approve.statusCode, 200);

  const publik = await app.inject({ method: 'GET', url: '/api/messages?since=0' });
  assert.equal(publik.json().total, 1);
  assert.equal(publik.json().messages[0].name, 'Sari');
  assert.equal(publik.json().messages[0].ip_hash, undefined);
  await app.close();
});

test('healthz dan header keamanan', async () => {
  const { app } = setup();
  const res = await app.inject({ method: 'GET', url: '/healthz' });
  assert.deepEqual(res.json(), { ok: true });
  assert.equal(res.headers['x-content-type-options'], 'nosniff');
  assert.equal(res.headers['x-frame-options'], 'DENY');
  await app.close();
});
