const express = require('express');
const db = require('../db');
const { requireAuth, requireAdmin } = require('../auth');

const router = express.Router();
router.use(requireAuth);

// Filtres disponibles (pour les menus déroulants de l'interface)
router.get('/meta', requireAdmin, (req, res) => {
  const users = db
    .prepare('SELECT DISTINCT username FROM activity_log WHERE username IS NOT NULL ORDER BY username')
    .all()
    .map((r) => r.username);
  const categories = db
    .prepare("SELECT DISTINCT category FROM activity_log ORDER BY category")
    .all()
    .map((r) => r.category)
    .filter(Boolean);
  res.json({ users, categories });
});

// Journal d'activité (admin) : ?limit=, ?user=, ?category=
router.get('/', requireAdmin, (req, res) => {
  const { limit, user, category } = req.query;
  const lim = Math.min(1000, Math.max(1, parseInt(limit, 10) || 200));
  const where = [];
  const params = [];
  if (user) { where.push('username = ?'); params.push(String(user)); }
  if (category) { where.push('category = ?'); params.push(String(category)); }

  const sql = `
    SELECT id, created_at, username, category, action, target, detail
    FROM activity_log
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY id DESC
    LIMIT ?`;
  params.push(lim);
  res.json(db.prepare(sql).all(...params));
});

module.exports = router;