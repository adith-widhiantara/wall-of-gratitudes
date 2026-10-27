'use strict';

const { buildApp } = require('./app');

const adminPassword = process.env.ADMIN_PASSWORD ?? '';
const cookieSecret = process.env.COOKIE_SECRET ?? '';

if (adminPassword.length < 8 || adminPassword === 'ganti-saya') {
  console.error('ADMIN_PASSWORD wajib diisi, minimal 8 karakter, dan bukan nilai contoh. Aplikasi tidak dijalankan.');
  process.exit(1);
}
if (cookieSecret.length < 16 || cookieSecret === 'ganti-saya-cookie-secret') {
  console.error('COOKIE_SECRET wajib diisi, minimal 16 karakter, dan bukan nilai contoh. Aplikasi tidak dijalankan.');
  process.exit(1);
}

const publicUrl = (process.env.PUBLIC_URL || '').replace(/\/$/, '');

if (process.env.NODE_ENV === 'production' && !publicUrl.startsWith('https://')) {
  console.warn(
    'PERINGATAN: NODE_ENV=production tetapi PUBLIC_URL kosong atau bukan https. ' +
      'Cookie admin dan cookie perangkat tidak diberi flag Secure.',
  );
}

const app = buildApp({
  dataDir: process.env.DATA_DIR || './data',
  adminPassword,
  cookieSecret,
  eventTitle: process.env.EVENT_TITLE || 'Wall of Gratitude',
  publicUrl,
  trustProxy: process.env.TRUST_PROXY === '1',
});

const port = Number(process.env.PORT) || 8080;

app.listen({ port, host: '0.0.0.0' }).catch((err) => {
  console.error('Server gagal berjalan:', err.message);
  process.exit(1);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => app.close().then(() => process.exit(0)));
}
