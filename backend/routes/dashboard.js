const express = require('express');
const db = require('../db');
const { requireAuth } = require('../auth');

const router = express.Router();
router.use(requireAuth);

router.get('/', (req, res) => {
  const total = db.prepare('SELECT COUNT(*) AS c FROM contracts').get().c;

  const now = new Date().toISOString().slice(0, 10);

  const expiring90 = db.prepare(
    `SELECT COUNT(*) AS c FROM contracts
     WHERE contract_end IS NOT NULL AND contract_end != ''
       AND date(contract_end) BETWEEN date(?) AND date(?, '+90 days')`
  ).get(now, now).c;

  const expired = db.prepare(
    `SELECT COUNT(*) AS c FROM contracts
     WHERE contract_end IS NOT NULL AND contract_end != ''
       AND date(contract_end) < date(?)`
  ).get(now).c;

  const stopped = db.prepare('SELECT COUNT(*) AS c FROM contracts WHERE contract_stop = 1').get().c;

  const totalAmount = db.prepare(
    'SELECT COALESCE(SUM(CAST(amount AS REAL)), 0) AS s FROM contracts'
  ).get().s;

  // Ventilation par type de contrat
  const byType = db.prepare(
    `SELECT contract_type, COUNT(*) AS n
     FROM contracts
     WHERE contract_type IS NOT NULL AND contract_type != ''
     GROUP BY contract_type ORDER BY n DESC`
  ).all().map((r) => ({ key: r.contract_type, value: r.n }));

  // Montants par type de contrat
  const amountByType = db.prepare(
    `SELECT contract_type, SUM(CAST(amount AS REAL)) AS s
     FROM contracts
     WHERE contract_type IS NOT NULL AND contract_type != '' AND amount IS NOT NULL
     GROUP BY contract_type ORDER BY s DESC`
  ).all().map((r) => ({ key: r.contract_type, value: Math.round(r.s * 100) / 100 }));

  // Groupes clients les plus représentés
  const byGroup = db.prepare(
    `SELECT customer_group, COUNT(*) AS n
     FROM contracts
     WHERE customer_group IS NOT NULL AND customer_group != ''
     GROUP BY customer_group ORDER BY n DESC LIMIT 10`
  ).all().map((r) => ({ key: r.customer_group, value: r.n }));

  // Account managers actifs
  const byManager = db.prepare(
    `SELECT account_manager, COUNT(*) AS n
     FROM contracts
     WHERE account_manager IS NOT NULL AND account_manager != ''
     GROUP BY account_manager ORDER BY n DESC LIMIT 10`
  ).all().map((r) => ({ key: r.account_manager, value: r.n }));

  // Expirations des 6 prochains mois, groupées par mois
  const expirations = db.prepare(
    `SELECT strftime('%Y-%m', contract_end) AS mois, COUNT(*) AS n
     FROM contracts
     WHERE contract_end IS NOT NULL AND contract_end != ''
       AND date(contract_end) BETWEEN date(?) AND date(?, '+6 months')
     GROUP BY mois ORDER BY mois`
  ).all(now, now);

  res.json({
    total,
    expiring90,
    expired,
    stopped,
    totalAmount,
    byType,
    amountByType,
    byGroup,
    byManager,
    expirations
  });
});

router.get('/expiring', (req, res) => {
  const now = new Date().toISOString().slice(0, 10);
  const target = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const rows = db.prepare(
    `SELECT * FROM contracts
     WHERE contract_end IS NOT NULL AND contract_end != ''
       AND date(contract_end) BETWEEN date(?) AND date(?)
     ORDER BY contract_end ASC`
  ).all(now, target);
  res.json(rows);
});

module.exports = router;