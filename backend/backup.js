const XLSX = require('xlsx');
const db = require('./db');

// Tables exportées dans le classeur Excel (un onglet par table).
// L'ordre compte : contracts avant contract_remarks (clé étrangère).
const TABLES = [
  { name: 'contracts', exclude: [] },
  { name: 'contract_remarks', exclude: [] },
  { name: 'users', exclude: [] },
  { name: 'settings', exclude: [] },
  { name: 'activity_log', exclude: [] }
];

function tableColumns(name) {
  return db
    .prepare(`PRAGMA table_info(${name})`)
    .all()
    .map((c) => c.name);
}

function summary() {
  const s = {};
  for (const t of TABLES) {
    s[t.name] = db.prepare(`SELECT COUNT(*) AS n FROM ${t.name}`).get().n;
  }
  return s;
}

// Construit le classeur Excel complet (toutes les tables en onglets séparés)
function buildBackupWorkbook() {
  const wb = XLSX.utils.book_new();
  for (const t of TABLES) {
    const columns = tableColumns(t.name).filter((c) => !t.exclude.includes(c));
    const rows = db
      .prepare(`SELECT ${columns.map((c) => `"${c}"`).join(', ')} FROM ${t.name}`)
      .all();
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = columns.map(() => ({ wch: 18 }));
    XLSX.utils.book_append_sheet(wb, ws, t.name);
  }
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

function importRows(table, rows) {
  if (!rows || !rows.length) return 0;
  const columns = tableColumns(table);
  const keys = Object.keys(rows[0]).filter((k) => columns.includes(k));
  if (!keys.length) return 0;
  const stmt = db.prepare(
    `INSERT INTO ${table} (${keys.map((k) => `"${k}"`).join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`
  );
  for (const r of rows) {
    stmt.run(...keys.map((k) => (r[k] === undefined || r[k] === '') ? null : r[k]));
  }
  return rows.length;
}

// Reconstruit la base à partir du classeur. Remplace le contenu complet des
// tables de sauvegarde (idempotent : rejouable après une erreur).
function importBackup(buffer) {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const before = summary();
  const restore = TABLES.filter((t) => wb.Sheets[t.name]);
  const originalAdmins = db
    .prepare(`SELECT id, username, password_hash, role, email, created_at FROM users WHERE role = 'admin'`)
    .all();

  const tx = db.transaction(() => {
    for (const t of restore) {
      db.prepare(`DELETE FROM ${t.name}`).run();
    }
    for (const t of restore) {
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[t.name], { defval: '', raw: false });
      importRows(t.name, rows);
    }
  });
  tx();

  // Anciennes sauvegardes (sans onglet `contract_remarks`) : reconstruit les notes
  // « sans date » à partir de la colonne `remarks_bac` (une note par ligne).
  // Idempotent : ne touche pas les contrats ayant déjà des notes datées.
  if (typeof db.migrateLegacyRemarks === 'function') db.migrateLegacyRemarks();

  // Garde-fou : on ne restaure jamais une base sans administrateur.
  const adminsAfter = db.prepare(`SELECT id FROM users WHERE role = 'admin'`).all();
  if (!adminsAfter.length && originalAdmins.length) {
    const stmt = db.prepare(
      `INSERT INTO users (id, username, password_hash, role, email, created_at) VALUES (?, ?, ?, 'admin', ?, ?)`
    );
    for (const a of originalAdmins) {
      stmt.run(a.id, a.username, a.password_hash, a.email, a.created_at);
    }
  }

  return { before, after: summary() };
}

function backupFilename() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `contrats_backup_${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}.xlsx`;
}

// ---------------------------------------------------------------------------
// Sauvegarde / restauration au format SQL (dump complet de la base)
// ---------------------------------------------------------------------------

function quoteIdent(name) {
  return `"${String(name).replace(/"/g, '""')}"`;
}

function sqlLiteral(v) {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : 'NULL';
  if (typeof v === 'bigint') return String(v);
  if (Buffer.isBuffer(v)) return `X'${v.toString('hex')}'`;
  return `'${String(v).replace(/'/g, "''")}'`;
}

// Toutes les tables utilisateur (hors objets internes SQLite), tables avant index.
function sqlObjects() {
  return db
    .prepare(
      `SELECT type, name, sql FROM sqlite_master
        WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%'
        ORDER BY CASE type WHEN 'table' THEN 0 WHEN 'index' THEN 1 ELSE 2 END, rowid`
    )
    .all();
}

// Dump SQL texte de toute la base (structure + données), rejouable tel quel.
function sqlDump() {
  const objects = sqlObjects();
  const lines = [];
  lines.push('-- Sauvegarde SQL de la base Contrats');
  lines.push(`-- Genere le ${new Date().toISOString()}`);
  lines.push('PRAGMA foreign_keys=OFF;');
  lines.push('BEGIN TRANSACTION;');
  for (const o of objects) {
    if (o.type === 'table') lines.push(`DROP TABLE IF EXISTS ${quoteIdent(o.name)};`);
  }
  for (const o of objects) lines.push(`${o.sql};`);
  for (const o of objects) {
    if (o.type !== 'table') continue;
    const table = quoteIdent(o.name);
    const cols = tableColumns(o.name);
    const rows = db.prepare(`SELECT * FROM ${table}`).all();
    if (!rows.length) continue;
    const colList = cols.map(quoteIdent).join(', ');
    for (const r of rows) {
      lines.push(`INSERT INTO ${table} (${colList}) VALUES (${cols.map((c) => sqlLiteral(r[c])).join(', ')});`);
    }
  }
  lines.push('COMMIT;');
  lines.push('PRAGMA foreign_keys=ON;');
  return lines.join('\n') + '\n';
}

// Restaure la base depuis un dump SQL. Exécution transactionnelle : toute erreur
// (ou une base sans administrateur) annule la restauration.
function restoreSql(buffer) {
  let sql = buffer.toString('utf8').replace(/^\uFEFF/, '');
  if (!sql.trim()) throw new Error('Fichier SQL vide');
  if (!/\bCREATE\s+TABLE\b/i.test(sql) && !/\bINSERT\s+INTO\b/i.test(sql)) {
    throw new Error("Ce fichier ne ressemble pas à une sauvegarde SQL (aucun CREATE TABLE / INSERT INTO)");
  }
  // On gère nous-mêmes la transaction et les clés étrangères.
  sql = sql.replace(/^\s*(BEGIN(?:\s+TRANSACTION)?;|COMMIT;|PRAGMA\s+foreign_keys\s*=\s*(?:ON|OFF);)\s*$/gim, '');

  const before = summary();
  db.pragma('foreign_keys = OFF');
  try {
    const run = db.transaction(() => {
      db.exec(sql);
      let admins = 0;
      try {
        admins = db.prepare(`SELECT COUNT(*) AS c FROM users WHERE role = 'admin'`).get().c;
      } catch {
        admins = 0;
      }
      if (!admins) throw new Error('La sauvegarde ne contient aucun administrateur — restauration annulée');
    });
    run();
  } finally {
    db.pragma('foreign_keys = ON');
  }
  return { before, after: summary() };
}

function sqlFilename() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `contrats_db_${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}.sql`;
}

module.exports = { buildBackupWorkbook, importBackup, backupFilename, summary, sqlDump, restoreSql, sqlFilename };