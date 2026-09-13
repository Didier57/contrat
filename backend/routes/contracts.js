const express = require('express');
const multer = require('multer');
const { requireAuth, requireAdmin, requireEditor } = require('../auth');
const { logAudit } = require('../audit');
const db = require('../db');
const { migrateLegacyRemarks } = require('../db');
const { parseWorkbook } = require('../excel-import');
const { FIELD_NAMES } = require('../contract-fields');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 60 * 1024 * 1024 } });

router.use(requireAuth);

// GET /api/contracts - liste avec filtres (search global, contract_type, customer_group)
router.get('/', (req, res) => {
  const { search, contract_type, customer_group, expiring } = req.query;
  let sql = 'SELECT * FROM contracts WHERE 1=1';
  const params = [];

  if (search) {
    sql += ` AND (customer_name LIKE ? OR import_id LIKE ? OR sap_ewp LIKE ?
             OR main_contractual_subject LIKE ? OR account_manager LIKE ? OR wbs LIKE ?)`;
    const like = `%${search}%`;
    params.push(like, like, like, like, like, like);
  }
  if (contract_type) {
    sql += ' AND contract_type LIKE ?';
    params.push(`%${contract_type}%`);
  }
  if (customer_group) {
    sql += ' AND customer_group LIKE ?';
    params.push(`%${customer_group}%`);
  }
  if (expiring === 'true') {
    sql += ` AND contract_end IS NOT NULL AND contract_end != ''
             AND date(contract_end) BETWEEN date('now') AND date('now', '+90 days')`;
  }

  sql += ' ORDER BY customer_name COLLATE NOCASE ASC';
  const rows = db.prepare(sql).all(...params);

  const notes = db.prepare(
    `SELECT contract_id, text FROM contract_remarks
     ORDER BY contract_id ASC, (created_at IS NULL) ASC, created_at DESC, id DESC`
  ).all();
  const remarksByContract = new Map();
  for (const n of notes) {
    const list = remarksByContract.get(n.contract_id);
    if (list) list.push(n.text);
    else remarksByContract.set(n.contract_id, [n.text]);
  }
  for (const r of rows) {
    const list = remarksByContract.get(r.id);
    r.remarks_all = list && list.length ? list.join('\n') : null;
  }

  res.json(rows);
});

// GET /api/contracts/next-import-id - prochain ID attribué automatiquement
router.get('/next-import-id', (req, res) => {
  res.json({ import_id: nextImportId() });
});

// GET /api/contracts/:id
router.get('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM contracts WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Contrat introuvable' });
  res.json(row);
});

// POST /api/contracts - ajouter
router.post('/', requireEditor, (req, res) => {
  const data = {};
  for (const k of FIELD_NAMES) data[k] = req.body[k] ?? null;
  data.import_id = nextImportId(); // ID attribué automatiquement (non modifiable)
  data.updated_at = new Date().toISOString();
  data.updated_by = req.user.username;

  const cols = [...FIELD_NAMES, 'updated_at', 'updated_by'];
  const placeholders = cols.map((c) => `@${c}`).join(', ');
  const values = {};
  for (const c of cols) values[c] = data[c];

  const info = db.prepare(
    `INSERT INTO contracts (${cols.join(', ')}) VALUES (${placeholders})`
  ).run(values);

  const row = db.prepare('SELECT * FROM contracts WHERE id = ?').get(info.lastInsertRowid);
  migrateLegacyRemarks(); // remarque initiale => note(s) « sans date »
  logAudit({
    user: req.user,
    action: 'Ajout d\'un contrat',
    category: 'contract',
    target: row.customer_name || `contrat #${row.id}`
  });
  res.status(201).json(row);
});

// PUT /api/contracts/:id - modifier
router.put('/:id', requireEditor, (req, res) => {
  const existing = db.prepare('SELECT * FROM contracts WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Contrat introuvable' });

  const sets = [];
  const params = [];
  for (const k of FIELD_NAMES) {
    if (req.body[k] !== undefined) {
      sets.push(`"${k}" = ?`);
      params.push(req.body[k] ?? null);
    }
  }
  const changed = FIELD_NAMES.filter(
    (k) => req.body[k] !== undefined && String(req.body[k] ?? '') !== String(existing[k] ?? '')
  );
  sets.push('updated_at = ?');
  sets.push('updated_by = ?');
  params.push(new Date().toISOString(), req.user.username, req.params.id);

  db.prepare(`UPDATE contracts SET ${sets.join(', ')} WHERE id = ?`).run(...params);
  const row = db.prepare('SELECT * FROM contracts WHERE id = ?').get(req.params.id);
  logAudit({
    user: req.user,
    action: 'Modification d\'un contrat',
    category: 'contract',
    target: existing.customer_name || `contrat #${existing.id}`,
    detail: changed.length ? changed.map((k) => k.replace(/_/g, ' ')).join(', ') : null
  });
  res.json(row);
});

// GET /api/contracts/:id/remarks - notes Remarks Bac (plus récentes en premier)
router.get('/:id/remarks', (req, res) => {
  const existing = db.prepare('SELECT id FROM contracts WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Contrat introuvable' });
  const rows = db.prepare(
    `SELECT id, text, created_at FROM contract_remarks
     WHERE contract_id = ?
     ORDER BY (created_at IS NULL) ASC, created_at DESC, id DESC`
  ).all(req.params.id);
  res.json(rows);
});

// POST /api/contracts/:id/remarks - ajouter une note (date/heure enregistrées)
router.post('/:id/remarks', requireEditor, (req, res) => {
  const existing = db.prepare('SELECT * FROM contracts WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Contrat introuvable' });
  const text = String(req.body.text || '').trim();
  if (!text) return res.status(400).json({ error: 'Note vide' });

  const createdAt = new Date().toISOString();
  const info = db.prepare(
    'INSERT INTO contract_remarks (contract_id, text, created_at) VALUES (?, ?, ?)'
  ).run(req.params.id, text, createdAt);
  syncRemarksMirror(req.params.id);

  logAudit({
    user: req.user,
    action: 'Ajout d\'une note Remarks',
    category: 'contract',
    target: existing.customer_name || `contrat #${existing.id}`
  });
  res.status(201).json({ id: info.lastInsertRowid, contract_id: Number(req.params.id), text, created_at: createdAt });
});

// PUT /api/contracts/:id/remarks/:rid - modifier une note
router.put('/:id/remarks/:rid', requireEditor, (req, res) => {
  const existing = db.prepare('SELECT * FROM contracts WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Contrat introuvable' });
  const note = db.prepare(
    'SELECT * FROM contract_remarks WHERE id = ? AND contract_id = ?'
  ).get(req.params.rid, req.params.id);
  if (!note) return res.status(404).json({ error: 'Note introuvable' });
  const text = String(req.body.text || '').trim();
  if (!text) return res.status(400).json({ error: 'Note vide' });

  db.prepare('UPDATE contract_remarks SET text = ? WHERE id = ?').run(text, req.params.rid);
  syncRemarksMirror(req.params.id);

  logAudit({
    user: req.user,
    action: 'Modification d\'une note Remarks',
    category: 'contract',
    target: existing.customer_name || `contrat #${existing.id}`
  });
  res.json({ ok: true, id: note.id, text, created_at: note.created_at });
});

// DELETE /api/contracts/:id/remarks/:rid - supprimer une note
router.delete('/:id/remarks/:rid', requireEditor, (req, res) => {
  const existing = db.prepare('SELECT * FROM contracts WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Contrat introuvable' });
  const note = db.prepare(
    'SELECT id FROM contract_remarks WHERE id = ? AND contract_id = ?'
  ).get(req.params.rid, req.params.id);
  if (!note) return res.status(404).json({ error: 'Note introuvable' });

  db.prepare('DELETE FROM contract_remarks WHERE id = ?').run(req.params.rid);
  syncRemarksMirror(req.params.id);

  logAudit({
    user: req.user,
    action: 'Suppression d\'une note Remarks',
    category: 'contract',
    target: existing.customer_name || `contrat #${existing.id}`
  });
  res.json({ ok: true });
});

// Prochain ID = plus grand import_id numérique + 1
function nextImportId() {
  const row = db.prepare('SELECT MAX(CAST(import_id AS INTEGER)) AS m FROM contracts').get();
  const m = row && row.m != null ? Number(row.m) : 0;
  return String(m + 1);
}

// Recalcule le « dernier commentaire » (colonne remarks_bac) depuis les notes
function syncRemarksMirror(contractId) {
  const latest = db.prepare(
    `SELECT text FROM contract_remarks
     WHERE contract_id = ?
     ORDER BY (created_at IS NULL) ASC, created_at DESC, id DESC LIMIT 1`
  ).get(contractId);
  db.prepare('UPDATE contracts SET remarks_bac = ? WHERE id = ?')
    .run(latest ? latest.text : null, contractId);
}

// DELETE /api/contracts/:id
router.delete('/:id', requireAdmin, (req, res) => {
  const existing = db.prepare('SELECT * FROM contracts WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Contrat introuvable' });
  db.prepare('DELETE FROM contracts WHERE id = ?').run(req.params.id);
  logAudit({
    user: req.user,
    action: 'Suppression d\'un contrat',
    category: 'contract',
    target: existing.customer_name || `contrat #${existing.id}`
  });
  res.json({ ok: true });
});

// POST /api/contracts/import - import Excel complet (admin) : remplace tout le contenu
router.post('/import', requireAdmin, upload.single('file'), (req, res) => {
  if (!req.file) {
    logAudit({ user: req.user, action: 'Échec import Excel des contrats', category: 'import', detail: 'fichier manquant' });
    return res.status(400).json({ error: 'Fichier Excel manquant' });
  }
  const { rows, ignored, errors } = parseWorkbook(req.file.buffer);
  if (!rows.length) {
    logAudit({
      user: req.user,
      action: 'Échec import Excel des contrats',
      category: 'import',
      target: req.file.originalname,
      detail: 'aucune ligne valide'
    });
    return res.status(400).json({
      error: `Aucune ligne valide trouvée dans « ${req.file.originalname} ».`,
      detail: errors.join(' · ')
    });
  }

  const tx = db.transaction((list) => {
    db.prepare('DELETE FROM contracts').run();
    const insert = db.prepare(
      `INSERT INTO contracts (${FIELD_NAMES.join(', ')}) VALUES (${FIELD_NAMES.map(() => '?').join(', ')})`
    );
    for (const r of list) {
      insert.run(...FIELD_NAMES.map((f) => r[f] ?? null));
    }
  });
  tx(rows);
  migrateLegacyRemarks(); // chaque remarque importée devient une note « sans date »

  logAudit({
    user: req.user,
    action: 'Import Excel des contrats',
    category: 'import',
    target: req.file.originalname,
    detail: `${rows.length} ligne(s) importée(s), ${ignored} ignorée(s)`
  });

  res.json({
    ok: true,
    imported: rows.length,
    ignored,
    errors,
    message: `${rows.length} contrat(s) importé(s), ${ignored} ligne(s) ignorée(s)`
  });
});

module.exports = router;