const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const { FIELD_NAMES } = require('./contract-fields');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'contrats.db');
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const columnDefs = FIELD_NAMES.map((f) => `"${f}" TEXT`).join(',\n    ');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'lecteur',
    email TEXT,
    active INTEGER NOT NULL DEFAULT 1,
    preferences TEXT,
    notify_expiry INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS contracts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ${columnDefs},
    updated_at TEXT,
    updated_by TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_contracts_name ON contracts(customer_name);
  CREATE INDEX IF NOT EXISTS idx_contracts_end ON contracts(contract_end);
  CREATE INDEX IF NOT EXISTS idx_contracts_type ON contracts(contract_type);

  CREATE TABLE IF NOT EXISTS contract_remarks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    contract_id INTEGER NOT NULL,
    text TEXT NOT NULL,
    created_at TEXT,
    FOREIGN KEY (contract_id) REFERENCES contracts(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_remarks_contract ON contract_remarks(contract_id);

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );

  CREATE TABLE IF NOT EXISTS password_resets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    token TEXT UNIQUE NOT NULL,
    expires_at TEXT NOT NULL,
    used INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS activity_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    user_id INTEGER,
    username TEXT,
    category TEXT NOT NULL DEFAULT 'general',
    action TEXT NOT NULL,
    target TEXT,
    detail TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_activity_created ON activity_log(id DESC);
  CREATE INDEX IF NOT EXISTS idx_activity_user ON activity_log(username);
  CREATE INDEX IF NOT EXISTS idx_activity_category ON activity_log(category);
`);

// Migration : ajout des colonnes email / active si absentes (BDD existante)
const userCols = db.prepare('PRAGMA table_info(users)').all();
if (!userCols.some((c) => c.name === 'email')) {
  db.exec('ALTER TABLE users ADD COLUMN email TEXT');
}
if (!userCols.some((c) => c.name === 'active')) {
  db.exec('ALTER TABLE users ADD COLUMN active INTEGER NOT NULL DEFAULT 1');
}
if (!userCols.some((c) => c.name === 'preferences')) {
  db.exec('ALTER TABLE users ADD COLUMN preferences TEXT');
}
if (!userCols.some((c) => c.name === 'notify_expiry')) {
  db.exec('ALTER TABLE users ADD COLUMN notify_expiry INTEGER NOT NULL DEFAULT 0');
}

// Notes Remarks Bac : chaque remarque existante (colonne legacy remarks_bac)
// devient une note « sans date » dans contract_remarks (1 note par ligne).
// Idempotent : rejoué à chaque démarrage, ne reconstruit que si le contenu a changé.
function migrateLegacyRemarks() {
  const rows = db.prepare(
    `SELECT id, remarks_bac FROM contracts
     WHERE remarks_bac IS NOT NULL AND TRIM(remarks_bac) != ''`
  ).all();
  const legacyNotes = db.prepare(
    'SELECT text FROM contract_remarks WHERE contract_id = ? AND created_at IS NULL ORDER BY id ASC'
  );
  const hasDated = db.prepare(
    'SELECT COUNT(*) AS c FROM contract_remarks WHERE contract_id = ? AND created_at IS NOT NULL'
  );
  const deleteLegacy = db.prepare(
    'DELETE FROM contract_remarks WHERE contract_id = ? AND created_at IS NULL'
  );
  const insert = db.prepare(
    'INSERT INTO contract_remarks (contract_id, text, created_at) VALUES (?, ?, NULL)'
  );

  for (const r of rows) {
    if (hasDated.get(r.id).c) continue; // contrats avec notes datées : on ne touche pas
    const expected = String(r.remarks_bac).split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
    if (!expected.length) continue;
    const joined = legacyNotes.all(r.id).map((n) => n.text).join('\n');
    if (joined !== expected.join('\n')) {
      deleteLegacy.run(r.id);
      for (const line of expected) insert.run(r.id, line);
    }
  }
}
migrateLegacyRemarks();

module.exports = db;
module.exports.migrateLegacyRemarks = migrateLegacyRemarks;