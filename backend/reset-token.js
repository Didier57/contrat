const crypto = require('crypto');
const db = require('./db');

const TOKEN_TTL_MS = 72 * 60 * 60 * 1000; // 72 h

// Génère un token de réinitialisation pour un utilisateur (les anciens sont invalidés)
function createResetToken(userId, ttlMs = TOKEN_TTL_MS) {
  db.prepare('UPDATE password_resets SET used = 1 WHERE user_id = ? AND used = 0').run(userId);
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + ttlMs).toISOString();
  db.prepare('INSERT INTO password_resets (user_id, token, expires_at) VALUES (?, ?, ?)')
    .run(userId, token, expiresAt);
  return token;
}

// Consomme le token : retourne { userId } si valide et non expiré, sinon null
function consumeResetToken(token) {
  const row = db.prepare('SELECT * FROM password_resets WHERE token = ? AND used = 0').get(token);
  if (!row) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) return null;
  db.prepare('UPDATE password_resets SET used = 1 WHERE id = ?').run(row.id);
  return { userId: row.user_id };
}

// Mot de passe temporaire lisible (min. 10 caractères, sans ambigus 0/O/1/l/I)
function generateTemporaryPassword(length = 10) {
  const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i++) out += chars[bytes[i] % chars.length];
  return out;
}

module.exports = { createResetToken, consumeResetToken, generateTemporaryPassword };