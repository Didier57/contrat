const express = require('express');
const db = require('../db');
const { requireAuth } = require('../auth');

const router = express.Router();
router.use(requireAuth);

router.get('/', (req, res) => {
  // Seuls les contrats encore actifs (Stat = 0) comptent dans les statistiques
  const ACTIVE = `CAST(COALESCE(contract_stop,'0') AS REAL) = 0`;

  const total = db.prepare(
    `SELECT COUNT(*) AS c FROM contracts WHERE ${ACTIVE}`
  ).get().c;

  const now = new Date().toISOString().slice(0, 10);

  const expiring90 = db.prepare(
    `SELECT COUNT(*) AS c FROM contracts
     WHERE ${ACTIVE}
       AND contract_end IS NOT NULL AND contract_end != ''
       AND date(contract_end) BETWEEN date(?) AND date(?, '+90 days')`
  ).get(now, now).c;

  const expired = db.prepare(
    `SELECT COUNT(*) AS c FROM contracts
     WHERE ${ACTIVE}
       AND contract_end IS NOT NULL AND contract_end != ''
       AND date(contract_end) < date(?)`
  ).get(now).c;

  const totalAmount = db.prepare(
    `SELECT COALESCE(SUM(CAST(amount AS REAL)), 0) AS s FROM contracts WHERE ${ACTIVE}`
  ).get().s;

  // Ventilation par type de contrat
  const byType = db.prepare(
    `SELECT contract_type, COUNT(*) AS n
     FROM contracts
     WHERE ${ACTIVE} AND contract_type IS NOT NULL AND contract_type != ''
     GROUP BY contract_type ORDER BY n DESC`
  ).all().map((r) => ({ key: r.contract_type, value: r.n }));

  // Montants par type de contrat
  const amountByType = db.prepare(
    `SELECT contract_type, SUM(CAST(amount AS REAL)) AS s
     FROM contracts
     WHERE ${ACTIVE} AND contract_type IS NOT NULL AND contract_type != '' AND amount IS NOT NULL
     GROUP BY contract_type ORDER BY s DESC`
  ).all().map((r) => ({ key: r.contract_type, value: Math.round(r.s * 100) / 100 }));

  // Expirations des 6 prochains mois, groupées par mois
  const expirations = db.prepare(
    `SELECT strftime('%Y-%m', contract_end) AS mois, COUNT(*) AS n
     FROM contracts
     WHERE ${ACTIVE}
       AND contract_end IS NOT NULL AND contract_end != ''
       AND date(contract_end) BETWEEN date(?) AND date(?, '+6 months')
     GROUP BY mois ORDER BY mois`
  ).all(now, now);

  // Contrats en cours et stoppés par année (année issue de Contract Stop Date)
  const rows = db.prepare(
    `SELECT contract_start, contract_end, contract_stop_date FROM contracts`
  ).all();

  const years = new Set([String(new Date().getFullYear())]);
  const stopByYear = {};
  for (const r of rows) {
    const sd = r.contract_stop_date;
    if (sd && /^\d{4}/.test(String(sd))) {
      const y = String(sd).slice(0, 4);
      years.add(y);
      stopByYear[y] = (stopByYear[y] || 0) + 1;
    }
  }

  const stopByYearSeries = [...years].sort().map((y) => {
    const enCours = rows.filter((r) => {
      if (r.contract_stop_date) return false; // stoppé => pas « en cours »
      const s = String(r.contract_start || '');
      const e = String(r.contract_end || '');
      return /^\d{4}/.test(s) && /^\d{4}/.test(e)
        && s.slice(0, 4) <= y && e.slice(0, 4) >= y;
    }).length;
    return { year: y, enCours, stoppes: stopByYear[y] || 0 };
  });

  res.json({
    total,
    expiring90,
    expired,
    totalAmount,
    byType,
    amountByType,
    expirations,
    stopByYear: stopByYearSeries
  });
});

router.get('/expiring', (req, res) => {
  const now = new Date().toISOString().slice(0, 10);
  const target = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const rows = db.prepare(
    `SELECT * FROM contracts
     WHERE CAST(COALESCE(contract_stop,'0') AS REAL) = 0
       AND contract_end IS NOT NULL AND contract_end != ''
       AND date(contract_end) BETWEEN date(?) AND date(?)
     ORDER BY contract_end ASC`
  ).all(now, target);
  res.json(rows);
});

module.exports = router;