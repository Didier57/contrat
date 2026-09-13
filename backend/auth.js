const jwt = require('jsonwebtoken');
const db = require('./db');
const { JWT_SECRET, JWT_EXPIRES } = require('./config');

function sign(user) {
  return jwt.sign(
    { id: user.id, username: user.username, role: user.role },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES }
  );
}

function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentification requise' });
  }
  const token = header.slice(7);
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    const u = db.prepare('SELECT active FROM users WHERE id = ?').get(req.user.id);
    if (!u || u.active !== 1) {
      return res.status(401).json({ error: 'Compte désactivé' });
    }
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Token invalide ou expiré' });
  }
}

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Accès réservé aux administrateurs' });
  }
  next();
}

// Auteur d'actions sur les contrats : administrateur ou éditeur
function requireEditor(req, res, next) {
  if (!req.user || (req.user.role !== 'admin' && req.user.role !== 'editeur')) {
    return res.status(403).json({ error: 'Accès réservé aux administrateurs et éditeurs' });
  }
  next();
}

module.exports = { sign, requireAuth, requireAdmin, requireEditor };
