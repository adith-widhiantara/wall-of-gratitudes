'use strict';

const crypto = require('node:crypto');
const path = require('node:path');
const fastify = require('fastify');
const cookie = require('@fastify/cookie');
const formbody = require('@fastify/formbody');
const fastifyStatic = require('@fastify/static');
const QRCode = require('qrcode');
const { openDb } = require('./db');

const COLORS = ['kuning', 'mint', 'biru', 'peach', 'mawar', 'lavender'];
const STATUSES = ['pending', 'approved', 'rejected'];
const COOLDOWN_MS = 20 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const MAX_PER_HOUR = 15;
const COOKIE_MAX_AGE_S = 7 * 24 * 60 * 60;
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

const sha256 = (value) => crypto.createHash('sha256').update(value).digest();
const samePassword = (given, expected) => crypto.timingSafeEqual(sha256(given), sha256(expected));

function validate(body) {
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const message = typeof body.message === 'string' ? body.message.trim() : '';
  const color = COLORS.includes(body.color) ? body.color : null;
  const errors = {};
  if (name.length > 30) errors.name = 'Nama maksimal 30 huruf.';
  if (message.length < 3) errors.message = 'Pesan minimal 3 huruf.';
  else if (message.length > 280) errors.message = 'Pesan maksimal 280 huruf.';
  if (!color) errors.color = 'Pilih warna kertas dulu.';
  return { errors, value: { name: name || null, message, color } };
}

function buildApp({ dataDir, adminPassword, cookieSecret, eventTitle, publicUrl }) {
  const db = openDb(dataDir);
  const app = fastify({ logger: { level: 'warn' }, trustProxy: true, bodyLimit: 2048 });

  const hashIp = (ip) => crypto.createHash('sha256').update(ip + cookieSecret).digest('hex');

  const q = {
    insert: db.prepare(`
      INSERT INTO messages (name, message, color, status, created_at, ip_hash)
      VALUES (@name, @message, @color, 'pending', @created_at, @ip_hash)`),
    recent: db.prepare(
      'SELECT COUNT(*) AS n, MAX(created_at) AS last FROM messages WHERE ip_hash = ? AND created_at > ?'),
    publicList: db.prepare(`
      SELECT id, name, message, color, created_at FROM messages
      WHERE status = 'approved' AND id > ?
      ORDER BY created_at DESC, id DESC LIMIT 1000`),
    approvedCount: db.prepare("SELECT COUNT(*) AS n FROM messages WHERE status = 'approved'"),
    adminList: db.prepare(`
      SELECT id, name, message, color, status, created_at FROM messages
      WHERE status = ? ORDER BY created_at DESC, id DESC LIMIT 1000`),
    counts: db.prepare('SELECT status, COUNT(*) AS n FROM messages GROUP BY status'),
    setStatus: db.prepare('UPDATE messages SET status = ? WHERE id = ?'),
    remove: db.prepare('DELETE FROM messages WHERE id = ?'),
    approveAll: db.prepare("UPDATE messages SET status = 'approved' WHERE status = 'pending'"),
  };

  app.register(cookie, { secret: cookieSecret });
  app.register(formbody);
  app.register(fastifyStatic, { root: PUBLIC_DIR, prefix: '/' });

  app.addHook('onSend', async (req, reply, payload) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('X-Frame-Options', 'DENY');
    reply.header('Referrer-Policy', 'same-origin');
    reply.header(
      'Content-Security-Policy',
      "default-src 'self'; img-src 'self'; style-src 'self'; script-src 'self'; frame-ancestors 'none'",
    );
    return payload;
  });

  for (const page of ['wall', 'admin', 'qr']) {
    app.get(`/${page}`, (req, reply) => reply.sendFile(`${page}.html`));
  }

  app.get('/healthz', async () => ({ ok: true }));

  app.get('/api/config', async () => ({ eventTitle, publicUrl }));

  app.get('/qr.svg', async (req, reply) => {
    const target = `${publicUrl || `${req.protocol}://${req.host}`}/`;
    const svg = await QRCode.toString(target, {
      type: 'svg',
      margin: 1,
      color: { dark: '#1A1714', light: '#F6F1E8' },
    });
    reply.type('image/svg+xml');
    return svg;
  });

  app.get('/api/messages', async (req) => {
    const since = Math.max(0, Number.parseInt(req.query.since, 10) || 0);
    return { messages: q.publicList.all(since), total: q.approvedCount.get().n };
  });

  app.post('/api/messages', async (req, reply) => {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    // Honeypot: bot yang mengisi field tersembunyi dapat respons sukses palsu.
    if (typeof body.website === 'string' && body.website.trim() !== '') return { ok: true };

    const { errors, value } = validate(body);
    if (Object.keys(errors).length > 0) return reply.code(400).send({ ok: false, errors });

    const now = Date.now();
    const ipHash = hashIp(req.ip);
    const recent = q.recent.get(ipHash, now - HOUR_MS);
    if (recent.last !== null && now - recent.last < COOLDOWN_MS) {
      return reply.code(429).send({ ok: false, error: 'Tunggu 20 detik sebelum mengirim pesan lagi.' });
    }
    if (recent.n >= MAX_PER_HOUR) {
      return reply.code(429).send({ ok: false, error: 'Batas 15 pesan per jam sudah tercapai. Coba lagi nanti.' });
    }

    q.insert.run({ ...value, created_at: now, ip_hash: ipHash });
    return { ok: true };
  });

  app.post('/api/admin/login', async (req, reply) => {
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (!samePassword(password, adminPassword)) {
      return reply.code(401).send({ ok: false, error: 'Password salah.' });
    }
    reply.setCookie('admin', 'ok', {
      signed: true,
      httpOnly: true,
      sameSite: 'strict',
      path: '/',
      maxAge: COOKIE_MAX_AGE_S,
      secure: publicUrl.startsWith('https://'),
    });
    return { ok: true };
  });

  app.post('/api/admin/logout', async (req, reply) => {
    reply.clearCookie('admin', { path: '/' });
    return { ok: true };
  });

  const requireAdmin = async (req, reply) => {
    const session = req.unsignCookie(req.cookies.admin ?? '');
    if (!session.valid || session.value !== 'ok') {
      return reply.code(401).send({ ok: false, error: 'Sesi habis. Masuk lagi.' });
    }
  };

  app.get('/api/admin/messages', { preHandler: requireAdmin }, async (req) => {
    const status = STATUSES.includes(req.query.status) ? req.query.status : 'pending';
    const counts = { pending: 0, approved: 0, rejected: 0 };
    for (const row of q.counts.all()) counts[row.status] = row.n;
    return { messages: q.adminList.all(status), counts };
  });

  app.patch('/api/admin/messages/:id', { preHandler: requireAdmin }, async (req, reply) => {
    const status = req.body?.status;
    if (!STATUSES.includes(status)) {
      return reply.code(400).send({ ok: false, error: 'Status tidak dikenal.' });
    }
    if (q.setStatus.run(status, Number(req.params.id)).changes === 0) {
      return reply.code(404).send({ ok: false, error: 'Pesan tidak ditemukan.' });
    }
    return { ok: true };
  });

  app.delete('/api/admin/messages/:id', { preHandler: requireAdmin }, async (req, reply) => {
    if (q.remove.run(Number(req.params.id)).changes === 0) {
      return reply.code(404).send({ ok: false, error: 'Pesan tidak ditemukan.' });
    }
    return { ok: true };
  });

  app.post('/api/admin/approve-all', { preHandler: requireAdmin }, async () => ({
    ok: true,
    count: q.approveAll.run().changes,
  }));

  app.addHook('onClose', async () => db.close());

  return app;
}

module.exports = { buildApp, COLORS };
