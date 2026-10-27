'use strict';

const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');

function openDb(dataDir) {
  fs.mkdirSync(dataDir, { recursive: true });
  const db = new Database(path.join(dataDir, 'gratitude.db'));
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NULL,
      message TEXT NOT NULL,
      color TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at INTEGER NOT NULL,
      ip_hash TEXT,
      device_hash TEXT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_messages_status ON messages (status, created_at);
    CREATE INDEX IF NOT EXISTS idx_messages_ip ON messages (ip_hash, created_at);
  `);
  // Migrasi untuk database yang dibuat sebelum kolom device_hash ada.
  const kolom = db.prepare('PRAGMA table_info(messages)').all().map((c) => c.name);
  if (!kolom.includes('device_hash')) db.exec('ALTER TABLE messages ADD COLUMN device_hash TEXT NULL');
  db.exec('CREATE INDEX IF NOT EXISTS idx_messages_device ON messages (device_hash, created_at)');
  return db;
}

// Salinan database bertanggal lewat API backup (aman saat WAL aktif), lalu semua pesan dihapus.
// Dipakai bersama oleh endpoint admin dan skrip seed:reset. Kalau salinan gagal, tidak ada yang dihapus.
async function kosongkanSemua(db, dataDir) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backup = `backup-${stamp}.db`;
  await db.backup(path.join(dataDir, backup));
  const jumlah = db.prepare('DELETE FROM messages').run().changes;
  return { backup, jumlah };
}

module.exports = { openDb, kosongkanSemua };
