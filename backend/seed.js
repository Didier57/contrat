const db = require('./db');
const bcrypt = require('bcryptjs');

// Crée le compte admin par défaut si aucun utilisateur n'existe
function ensureDefaultAdmin() {
  const count = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
  if (count > 0) return false;
  const username = process.env.ADMIN_USER || 'admin';
  const password = process.env.ADMIN_PASSWORD || 'admin123';
  const role = process.env.ADMIN_ROLE || 'admin';
  const email = process.env.ADMIN_EMAIL || null;
  const hash = bcrypt.hashSync(password, 10);
  db.prepare('INSERT INTO users (username, password_hash, role, email) VALUES (?, ?, ?, ?)')
    .run(username, hash, role, email);
  console.log(`[seed] Utilisateur "${username}" créé par défaut (rôle: ${role}) — pensez à changer le mot de passe !`);
  return true;
}

// Les contrats sont importés via l'app (bouton « Importer Excel ») ou
// `node backend/import-excel.js`. Ici on ne gère que le compte admin initial.
function seed() {
  return false;
}

module.exports = { seed, ensureDefaultAdmin };