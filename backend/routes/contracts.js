const express = require('express');
const multer = require('multer');
const db = require('../db');
const { requireAuth, requireAdmin } = require('../auth');
const { logAudit } = require('../audit');
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
  res.json(db.prepare(sql).all(...params));
});

// GET /api/contracts/:id
router.get('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM contracts WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Contrat introuvable' });
  res.json(row);
});

// POST /api/contracts - ajouter
router.post('/', requireAdmin, (req, res) => {
  const data = {};
  for (const k of FIELD_NAMES) data[k] = req.body[k] ?? null;
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
  logAudit({
    user: req.user,
    action: 'Ajout d\'un contrat',
    category: 'contract',
    target: row.customer_name || `contrat #${row.id}`
  });
  res.status(201).json(row);
});

// PUT /api/contracts/:id - modifier
router.put('/:id', requireAdmin, (req, res) => {
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
  if (!req.file) return res.status(400).json({ error: 'Fichier Excel manquant' });
  const { rows, ignored, errors } = parseWorkbook(req.file.buffer);
  if (!rows.length) {
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