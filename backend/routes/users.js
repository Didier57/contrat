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
  const rows = db.prepare("SELECT id, username, role, email, active, totp_enabled, (totp_secret IS NOT NULL AND totp_secret != '') AS totp_configured, created_at FROM users ORDER BY username").all();
  res.json(rows);
});

// Créer un utilisateur (admin) : mot de passe généré + email d'invitation pour le définir
router.post('/', requireAdmin, async (req, res) => {
  const { username, role, email } = req.body;
  if (!username) {
    return res.status(400).json({ error: 'username requis' });
  }
  if (!['admin', 'editeur', 'lecteur'].includes(role)) {
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
        note: 'Ce lien expire dans 72 heures.'
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
    if (!['admin', 'editeur', 'lecteur'].includes(req.body.role)) return res.status(400).json({ error: 'Rôle invalide' });
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

// Renvoyer l'email d'invitation / de définition du mot de passe (admin)
router.post('/:id/resend-invite', requireAdmin, async (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' });
  if (!user.email) return res.status(400).json({ error: 'Aucune adresse email pour cet utilisateur' });
  if (!smtpConfigured()) return res.status(400).json({ error: 'L\'envoi d\'emails n\'est pas configuré' });

  const token = createResetToken(user.id);
  try {
    await sendPasswordEmailWithToken({
      to: user.email,
      token,
      subject: 'Contrats — définissez votre mot de passe',
      intro: `Bonjour ${user.username}, voici un nouveau lien pour définir votre mot de passe :`,
      username: user.username,
      note: 'Ce lien expire dans 72 heures.'
    });
  } catch (err) {
    console.error('[users] Échec renvoi invitation:', err.message);
    return res.status(500).json({ error: 'Impossible d\'envoyer l\'email — réessayez plus tard' });
  }

  logAudit({
    user: req.user,
    action: 'Renvoi de l\'invitation',
    category: 'user',
    target: `Utilisateur « ${user.username} »`,
    detail: user.email
  });
  res.json({ ok: true, emailSent: true });
});

// Réinitialise (désactive) la double authentification d'un utilisateur (admin)
// Utile si l'utilisateur a perdu son application d'authentification.
router.post('/:id/reset-2fa', requireAdmin, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' });
  db.prepare('UPDATE users SET totp_secret = NULL, totp_enabled = 0 WHERE id = ?').run(user.id);
  logAudit({
    user: req.user,
    action: 'Réinitialisation de la double authentification',
    category: 'user',
    target: `Utilisateur « ${user.username} »`
  });
  res.json({ ok: true });
});

// Active / désactive la double authentification sans effacer le secret (admin)
router.post('/:id/toggle-2fa', requireAdmin, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' });
  const enabled = !!req.body.enabled;
  if (enabled && !user.totp_secret) {
    return res.status(400).json({ error: 'Aucune application configurée pour cet utilisateur — il doit d\'abord activer la double authentification depuis son profil.' });
  }
  db.prepare('UPDATE users SET totp_enabled = ? WHERE id = ?').run(enabled ? 1 : 0, user.id);
  logAudit({
    user: req.user,
    action: enabled ? 'Activation de la double authentification (admin)' : 'Désactivation de la double authentification (admin)',
    category: 'user',
    target: `Utilisateur « ${user.username} »`
  });
  res.json({ ok: true, totp_enabled: enabled });
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
