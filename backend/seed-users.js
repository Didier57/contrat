const bcrypt = require('bcryptjs');
const db = require('./db');

const username = process.argv[2] || 'admin';
const password = process.argv[3] || 'admin123';
const role = process.argv[4] || 'admin';

const exists = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
if (exists) {
  console.log(`L'utilisateur "${username}" existe déjà.`);
} else {
  const hash = bcrypt.hashSync(password, 10);
  db.prepare('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)').run(username, hash, role);
  console.log(`Utilisateur créé: ${username} / ${password} (rôle: ${role})`);
}

// Afficher les utilisateurs existants
const users = db.prepare('SELECT id, username, role FROM users').all();
console.log('Utilisateurs:', users);
