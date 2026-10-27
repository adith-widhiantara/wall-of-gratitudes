# Wall of Gratitude

Dinding ucapan syukur untuk event offline. Peserta kirim ucapan lewat HP (scan QR),
panitia menyetujui di `/admin`, lalu ucapan yang disetujui tampil di `/wall` (layar proyektor).

Stack: Node.js 20, Fastify, better-sqlite3 (WAL), frontend HTML + CSS + JavaScript biasa.

## Halaman

| Path | Untuk | Keterangan |
|------|-------|------------|
| `/` | Peserta | Form ucapan, mobile first |
| `/wall` | Layar proyektor | Dinding sticky note, layar 1920x1080 |
| `/qr` | Layar tambahan | QR besar ke form |
| `/admin` | Panitia | Moderasi, password saja |
| `/healthz` | Monitoring | `{"ok":true}` |

## Menjalankan lokal dengan Docker

1. Salin contoh konfigurasi, lalu isi `ADMIN_PASSWORD` dan `COOKIE_SECRET` di `.env`:

   ```bash
   cp .env.example .env
   ```

2. Jalankan:

   ```bash
   docker compose up --build
   ```

3. Buka `http://localhost:8080`. Data tersimpan di folder `./data` di host.

Tanpa Docker (butuh Node 20 dan toolchain untuk build better-sqlite3):

```bash
npm install
set -a; . ./.env; set +a
npm start
```

Tes otomatis:

```bash
npm test
```

## Variabel lingkungan

| Nama | Wajib | Keterangan |
|------|-------|------------|
| `ADMIN_PASSWORD` | ya | Minimal 8 karakter. Aplikasi menolak jalan jika kosong atau nilai contoh. |
| `COOKIE_SECRET` | ya | Minimal 16 karakter. Dipakai untuk menandatangani cookie admin dan salt hash IP. |
| `PORT` | tidak | Default `8080`. |
| `DATA_DIR` | tidak | Default `./data`. Di container `/data`. |
| `EVENT_TITLE` | tidak | Judul event. Default `Wall of Gratitude`. |
| `PUBLIC_URL` | tidak | URL publik, dipakai untuk isi QR. Kalau kosong, QR memakai host request. |

## Deploy ke Fly.io (dari nol)

1. Pasang flyctl: ikuti panduan resmi di https://fly.io/docs/flyctl/install/ lalu login:

   ```bash
   fly auth login
   ```

2. Buat aplikasi tanpa men-deploy dulu (pakai `fly.toml` yang sudah ada):

   ```bash
   fly launch --no-deploy --copy-config
   ```

   Kalau nama `wall-of-gratitude` sudah dipakai, ganti `app` di `fly.toml` lalu ulangi.

3. Buat volume persisten. Harus dibuat sebelum deploy, nama dan region harus sama dengan `fly.toml` dan mesin:

   ```bash
   fly volumes create gratitude_data --size 1 --region sin
   ```

4. Pasang secret:

   ```bash
   fly secrets set ADMIN_PASSWORD='password-panjang-kamu' COOKIE_SECRET='string-acak-minimal-16-karakter'
   fly secrets set PUBLIC_URL='https://nama-app.fly.dev'
   ```

5. Deploy:

   ```bash
   fly deploy
   ```

6. Cek: `https://nama-app.fly.dev/healthz` harus mengembalikan `{"ok":true}`.

`auto_stop_machines = false` dan `min_machines_running = 1` di `fly.toml` membuat mesin tetap
hidup selama event. Jangan diubah saat hari-H.

## Backup database

Database ada di volume `/data`. Backup memakai API backup better-sqlite3 supaya aman saat WAL aktif:

```bash
fly ssh console -C "node -e \"require('/app/node_modules/better-sqlite3')('/data/gratitude.db').backup('/data/backup.db').then(()=>console.log('ok'))\""
fly ssh sftp get /data/backup.db ./gratitude-backup.db
fly ssh console -C "rm /data/backup.db"
```

Untuk lokal, cukup salin folder `./data` saat aplikasi berhenti.

## Checklist hari-H

- [ ] `ADMIN_PASSWORD` sudah diganti dan dicatat di tempat aman.
- [ ] `PUBLIC_URL` sudah sesuai domain yang dipakai, dan QR di `/qr` sudah dicoba dengan HP.
- [ ] `/healthz` mengembalikan `{"ok":true}`.
- [ ] Kirim satu ucapan uji dari HP, setujui di `/admin`, dan pastikan muncul di `/wall` dalam 5 detik.
- [ ] Buka `/wall` di layar proyektor, tekan "Layar penuh", dan pastikan teks terbaca dari jarak jauh.
- [ ] Mesin tidak sleep: `fly status` menunjukkan 1 mesin running.
- [ ] Backup pertama sudah diambil sebelum acara dimulai.
- [ ] Panitia moderasi sudah tahu alamat `/admin` dan cara memakainya dari HP.
- [ ] Batas posting: 1 ucapan per 20 detik dan 15 per jam per perangkat. Sesuaikan kalau acara ramai dari satu jaringan Wi-Fi, karena IP yang sama bisa kena batas.

## Catatan teknis

- Hanya ucapan berstatus `approved` yang tampil di `/wall`. Status `pending` dan `rejected` tidak pernah dikirim ke halaman publik.
- Nama tidak diisi tampil sebagai "Anonim".
- Log tidak mencatat isi pesan atau IP mentah. Yang disimpan hanya `sha256(ip + COOKIE_SECRET)`.
