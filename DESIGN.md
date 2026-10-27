# DESIGN.md — Wall of Gratitude

## Metafora
Papan pengumuman fisik di lorong kantor, bukan dashboard. Kertas tempel asli
yang ditempel orang sungguhan: sedikit miring, bertumpuk, warnanya warna kertas
yang dijual di toko ATK — bukan warna dari palet Tailwind.

Yang HARUS terasa: hangat, ramai, buatan tangan, personal.
Yang HARUS dihindari: korporat, steril, "produk SaaS", futuristik, techy.

## Palet
Latar wall (proyektor): #1A1714 — hitam kehangatan, bukan abu-abu biru.
Dipilih gelap karena ruangan event biasanya remang dan kertas pastel baru
menonjol di atas latar gelap.

6 warna sticky note (warna kertas sungguhan, bukan neon):
  kuning  #F2DFA0
  mint    #C5DEC3
  biru    #B5D3E7
  peach   #F2C9A8
  mawar   #EFC2C2
  lavender #D6CAE6

Teks di atas sticky note: #2B2520 (hampir hitam kecokelatan, bukan #000).
Latar halaman form di HP: #F6F1E8 — putih kertas, hangat. Form TIDAK dark mode.

Aksen satu-satunya: #B5553D (merah bata) untuk aksi destruktif di admin.
Tidak ada warna aksen lain. Tidak ada gradient di mana pun, titik.

## Tipografi
Wajib baca dari jarak 5-8 meter di layar proyektor, jadi keterbacaan menang
atas gaya.
- Teks pesan di wall: minimum 22px, line-height 1.45, font-weight 500.
- Nama pengirim: lebih kecil, italic, opacity 0.7.
- Maksimal 2 keluarga font di seluruh aplikasi. Boleh 1.
- Pakai font sistem atau font yang di-self-host. JANGAN load Google Fonts dari
  CDN — jaringan venue event sering lambat atau diblok.
- Jangan pakai font handwriting untuk isi pesan. Boleh untuk judul event saja.

## Liveliness dials
ENERGY: sedang-tinggi. Ini acara, bukan admin panel. Wall boleh ramai dan padat.
RHYTHM: bervariasi. Kartu tidak boleh seragam kaku — ukuran boleh sedikit beda
        mengikuti panjang pesan, rotasi acak -3deg s/d +3deg, offset vertikal kecil.
MOTION: hemat tapi ada. Gerakan hanya boleh dipakai saat menyampaikan informasi
        (pesan baru masuk, ganti halaman). Tidak ada animasi dekoratif,
        tidak ada parallax, tidak ada partikel, tidak ada elemen blur melayang.

## Yang dilarang di proyek ini
- Gradient apa pun, terutama ungu→biru.
- Glassmorphism, backdrop-blur, border 1px putih transparan.
- Emoji sebagai elemen UI (ikon tombol, bullet, dekorasi header).
  Emoji yang DIKETIK user di dalam pesan tentu saja boleh tampil.
- Badge atau pill berisi klaim ("Real-time", "AI-powered", "v2.0").
- Angka atau statistik yang tidak dihitung dari data asli. Kalau belum ada
  pesan, tulis "Belum ada pesan", bukan "0 pesan telah dibagikan".
- Skeleton shimmer. Interval refresh 5 detik terlalu cepat untuk itu —
  pakai perubahan diam-diam tanpa indikator loading.
- Ikon di samping setiap label form.
- Dark mode di halaman form HP. Satu tema saja, dikunci.

## Copywriting (bahasa Indonesia)
Bahasa Indonesia sehari-hari yang sopan. Bukan bahasa korporat, bukan bahasa
gaul berlebihan, bukan terjemahan kaku dari Inggris.
- Satu tanda seru maksimal per layar. Nol lebih baik.
- Label tombol pakai kata kerja yang spesifik: "Kirim", "Setujui", "Tolak".
  Bukan "Submit", bukan "Kirim Sekarang!", bukan "Lanjutkan".
- Pesan error menyebutkan apa yang salah dan apa yang harus dilakukan:
  "Pesan minimal 3 huruf" — bukan "Input tidak valid".
- Jangan ada microcopy yang memuji user ("Keren!", "Mantap!") atau basa-basi
  kosong ("Kami senang kamu di sini").
- Empty state: satu kalimat yang berguna, bukan ilustrasi besar plus paragraf.

## Aksesibilitas (tidak bisa ditawar)
- Kontras teks pada setiap warna sticky note minimum 4.5:1. Verifikasi
  satu per satu, keenam warna, bukan asumsi.
- Target tap minimum 44x44px di HP, termasuk lingkaran pemilih warna.
- Fokus keyboard terlihat jelas di semua kontrol admin — panitia kerja cepat
  dan sering pakai Tab.
- Setiap input punya <label> asli, bukan cuma placeholder.
- Halaman wall: `prefers-reduced-motion` mematikan rotasi dan transisi fade,
  diganti pergantian langsung.