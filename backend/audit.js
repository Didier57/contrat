const db = require('./db');

// Enregistre une entrée dans le journal d'activité (ne doit jamais faire échouer l'action)
function logAudit({ user = null, username = null, action, category = 'general', target = null, detail = null } = {}) {
  try {
    const uName = username || (user && user.username) || null;
    const detailStr = detail ? String(detail).slice(0, 500) : null;
    db.prepare(
      'INSERT INTO activity_log (user_id, username, category, action, target, detail) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(user ? user.id : null, uName, category, action, target, detailStr);
  } catch (e) {
    console.error('[audit] Échec écriture du log:', e.message);
  }
}

module.exports = { logAudit };