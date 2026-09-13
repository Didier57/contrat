const db = require('./db');

// Petites helpers de lecture/écriture des paramètres en base (table `settings`)

function getSetting(key, def = null) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : def;
}

function setSetting(key, value) {
  db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ' +
      'ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  ).run(key, String(value));
}

function getBool(key, def = false) {
  const v = getSetting(key);
  if (v === null || v === undefined) return def;
  return v === '1' || v === 'true' || v === 'on';
}

function getInt(key, def = 0) {
  const v = getSetting(key);
  const n = parseInt(v, 10);
  return Number.isNaN(n) ? def : n;
}

module.exports = { getSetting, setSetting, getBool, getInt };