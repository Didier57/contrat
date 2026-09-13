const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { requireAuth, requireAdmin } = require('../auth');
const { sendPasswordEmailWithToken, smtpConfigured } = require('../mailer');
const { createResetToken, generateTemporaryPassword } = require('../reset-token');
const { logAudit } = require('../audit');

const router = express.Router();
router.use(requireAuth);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Liste des utilisateurs (admin)
router.get('/', requireAdmin, (req, res) => {
  const rows = db.prepare('SELECT id, username, role, email, active, created_at FROM users ORDER BY username').all();
  res.json(rows);
});

// Créer un utilisateur (admin) : mot de passe généré + email d'invitation pour le définir
router.post('/', requireAdmin, async (req, res) => {
  const { username, role, email } = req.body;
  if (!username) {
    return res.status(400).json({ error: 'username requis' });
  }
  if (!['admin', 'lecteur'].includes(role)) {
    return res.status(400).json({ error: 'Rôle invalide' });
  }
  const vEmail = String(email || '').trim().toLowerCase();
  if (!vEmail || !EMAIL_RE.test(vEmail)) {
    return res.status(400).json({ error: 'Adresse email obligatoire et valide pour l\'invitation' });
  }
  const exists = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (exists) return res.status(400).json({ error: 'Cet utilisateur existe déjà' });

  const tempPassword = generateTemporaryPassword();
  const hash = bcrypt.hashSync(tempPassword, 10);
  const info = db.prepare('INSERT INTO users (username, password_hash, role, email) VALUES (?, ?, ?, ?)')
    .run(username, hash, role, vEmail);

  const token = createResetToken(info.lastInsertRowid);
  let emailSent = false;
  if (smtpConfigured()) {
    try {
      await sendPasswordEmailWithToken({
        to: vEmail,
        token,
        subject: 'Contrats — activez votre compte',
        intro: `Bonjour ${username}, un compte vient de vous être créé sur l'application Contrats. Cliquez ci-dessous pour définir votre mot de passe :`,
        username,
        note: 'Ce lien expire dans 24 heures.'
      });
      emailSent = true;
    } catch (err) {
      console.error('[users] Échec invitation email:', err.message);
    }
  }

  logAudit({
    user: req.user,
    action: 'Création d\'un utilisateur',
    category: 'user',
    target: `Utilisateur « ${username} »`,
    detail: `rôle ${role}, email ${vEmail}${emailSent ? ', invitation envoyée' : ', invitation NON envoyée'}`
  });

  res.status(201).json({
    id: info.lastInsertRowid,
    username,
    role,
    email: vEmail,
    emailSent,
    // Mot de passe temporaire fourni uniquement si l'email n'a pas pu partir
    temporaryPassword: emailSent ? undefined : tempPassword
  });
});

// Changer mot de passe / rôle / email (admin)
router.put('/:id', requireAdmin, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' });

  const sets = [];
  const params = [];
  if (req.body.role) {
    if (!['admin', 'lecteur'].includes(req.body.role)) return res.status(400).json({ error: 'Rôle invalide' });
    sets.push('role = ?');
    params.push(req.body.role);
  }
  if (req.body.email !== undefined) {
    sets.push('email = ?');
    params.push(req.body.email || null);
  }
  if (req.body.password) {
    sets.push('password_hash = ?');
    params.push(bcrypt.hashSync(req.body.password, 10));
  }
  if (req.body.active !== undefined) {
    const active = req.body.active ? 1 : 0;
    if (active === 0 && user.id === req.user.id) {
      return res.status(400).json({ error: 'Impossible de désactiver votre propre compte' });
    }
    sets.push('active = ?');
    params.push(active);
  }
  if (sets.length === 0) return res.status(400).json({ error: 'Rien à modifier' });

  const changed = [];
  if (req.body.role && req.body.role !== user.role) changed.push(`rôle → ${req.body.role}`);
  if (req.body.email !== undefined && String(req.body.email || '') !== String(user.email || '')) changed.push('email');
  if (req.body.password) changed.push('mot de passe');
  if (req.body.active !== undefined && (req.body.active ? 1 : 0) !== user.active) {
    changed.push(req.body.active ? 'compte activé' : 'compte désactivé');
  }

  params.push(req.params.id);
  db.prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`).run(...params);
  logAudit({
    user: req.user,
    action: 'Modification d\'un utilisateur',
    category: 'user',
    target: `Utilisateur « ${user.username} »`,
    detail: changed.join(', ') || null
  });
  res.json({ ok: true });
});

// Supprimer un utilisateur (admin)
router.delete('/:id', requireAdmin, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' });
  if (user.id === req.user.id) return res.status(400).json({ error: 'Impossible de supprimer son propre compte' });
  db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
  logAudit({
    user: req.user,
    action: 'Suppression d\'un utilisateur',
    category: 'user',
    target: `Utilisateur « ${user.username} »`,
    detail: `rôle ${user.role}`
  });
  res.json({ ok: true });
});

module.exports = router;
