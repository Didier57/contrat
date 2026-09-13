const express = require('express');
const db = require('../db');
const { requireAuth } = require('../auth');
const { FIELDS } = require('../contract-fields');
const { logAudit } = require('../audit');

const router = express.Router();
router.use(requireAuth);

function toCSV(rows) {
  const header = FIELDS.map((f) => `"${f.label.replace(/"/g, '""')}"`).join(';');
  const lines = rows.map((r) =>
    FIELDS.map((f) => {
      const v = r[f.field] == null ? '' : String(r[f.field]);
      return `"${v.replace(/"/g, '""')}"`;
    }).join(';')
  );
  return '\uFEFF' + [header, ...lines].join('\r\n');
}

// GET /api/export/csv
router.get('/csv', (req, res) => {
  const rows = db.prepare('SELECT * FROM contracts ORDER BY customer_name COLLATE NOCASE ASC').all();
  const csv = toCSV(rows);
  logAudit({
    user: req.user,
    action: 'Export CSV des contrats',
    category: 'contract',
    target: 'contracts.csv',
    detail: `${rows.length} contrat(s)`
  });
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="contracts.csv"');
  res.send(csv);
});

module.exports = router;