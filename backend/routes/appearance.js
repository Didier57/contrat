const express = require('express');
const { requireAuth, requireAdmin } = require('../auth');
const { getSetting, setSetting } = require('../settings');
const { logAudit } = require('../audit');

const router = express.Router();

// GET /api/appearance — configuration visuelle (lecture par tout utilisateur connecté)
router.get('/', requireAuth, (req, res) => {
  let cfg = {};
  try {
    const raw = getSetting('appearance', '');
    if (raw) cfg = JSON.parse(raw);
  } catch (e) {
    cfg = {};
  }
  res.json(cfg && typeof cfg === 'object' && !Array.isArray(cfg) ? cfg : {});
});

// PUT /api/appearance — enregistre la configuration visuelle (admin uniquement)
router.put('/', requireAuth, requireAdmin, (req, res) => {
  const body = req.body;
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return res.status(400).json({ error: 'Configuration invalide' });
  }
  const json = JSON.stringify(body);
  if (json.length > 100000) {
    return res.status(413).json({ error: 'Configuration trop volumineuse' });
  }
  setSetting('appearance', json);
  logAudit({ user: req.user, action: "Modification de l'apparence", category: 'settings' });
  res.json({ ok: true });
});

module.exports = router;
