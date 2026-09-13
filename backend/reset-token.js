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

// Vérifie un token SANS le consommer : { valid, reason, userId? }
// reason : 'valid' | 'not_found' | 'used' | 'expired'
function verifyResetToken(token) {
  const row = db.prepare('SELECT * FROM password_resets WHERE token = ?').get(token);
  if (!row) return { valid: false, reason: 'not_found' };
  if (row.used === 1) return { valid: false, reason: 'used' };
  if (new Date(row.expires_at).getTime() < Date.now()) return { valid: false, reason: 'expired' };
  return { valid: true, reason: 'valid', userId: row.user_id };
}

// Consomme le token : retourne { userId } si valide et non expiré, sinon null
function consumeResetToken(token) {
  const check = verifyResetToken(token);
  if (!check.valid) return null;
  db.prepare('UPDATE password_resets SET used = 1 WHERE token = ?').run(token);
  return { userId: check.userId };
}

// Mot de passe temporaire lisible (min. 10 caractères, sans ambigus 0/O/1/l/I)
function generateTemporaryPassword(length = 10) {
  const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i++) out += chars[bytes[i] % chars.length];
  return out;
}

module.exports = { createResetToken, verifyResetToken, consumeResetToken, generateTemporaryPassword };