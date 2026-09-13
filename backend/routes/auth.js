const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { sign, requireAuth, requireEditor } = require('../auth');
const { sendLoginNotification, sendPasswordEmailWithToken, sendExpiryReminderForUser, smtpConfigured } = require('../mailer');
const { createResetToken, consumeResetToken } = require('../reset-token');
const { logAudit } = require('../audit');

const router = express.Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

router.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Identifiants manquants' });
  }
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    logAudit({ username: String(username || '').trim() || null, action: 'Échec de connexion', category: 'login' });
    return res.status(401).json({ error: 'Identifiants invalides' });
  }
  if (user.active !== 1) {
    logAudit({ username: user.username, action: 'Tentative de connexion (compte désactivé)', category: 'login' });
    return res.status(401).json({ error: 'Compte désactivé — contactez un administrateur' });
  }
  // Notification de connexion aux autres admins (si activée) — non bloquant
  sendLoginNotification(user);
  logAudit({ user, action: 'Connexion', category: 'login', target: user.username });
  res.json({
    token: sign(user),
    user: {
      id: user.id,
      username: user.username,
      role: user.role,
      email: user.email,
      notify_expiry: user.notify_expiry === 1,
      notify_expiry_days: user.notify_expiry_days ?? 7,
      notify_expiry_hour: user.notify_expiry_hour ?? 8
    }
  });
});

router.get('/me', requireAuth, (req, res) => {
  const user = db.prepare('SELECT id, username, role, email, notify_expiry, notify_expiry_days, notify_expiry_hour FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(401).json({ error: 'Utilisateur introuvable' });
  res.json({ ...user, notify_expiry: user.notify_expiry === 1 });
});

// L'utilisateur modifie ses propres informations (username, email, mot de passe)
router.put('/profile', requireAuth, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(401).json({ error: 'Utilisateur introuvable' });

  const { username, email, currentPassword, newPassword, notify_expiry, notify_expiry_days, notify_expiry_hour } = req.body || {};

  // Vérifier le mot de passe actuel si on veut en changer un
  if (newPassword) {
    if (!currentPassword || !bcrypt.compareSync(currentPassword, user.password_hash)) {
      return res.status(400).json({ error: 'Mot de passe actuel incorrect' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'Le nouveau mot de passe doit faire au moins 6 caractères' });
    }
  }

  let newUsername = user.username;
  let newEmail = user.email;

  if (username !== undefined) {
    const v = String(username).trim();
    if (!v) return res.status(400).json({ error: "Le nom d'utilisateur ne peut pas être vide" });
    if (v !== user.username) {
      const exists = db.prepare('SELECT id FROM users WHERE username = ? AND id != ?').get(v, user.id);
      if (exists) return res.status(400).json({ error: "Ce nom d'utilisateur est déjà pris" });
    }
    newUsername = v;
  }

  if (email !== undefined) {
    const v = String(email).trim();
    if (v && !EMAIL_RE.test(v)) return res.status(400).json({ error: 'Adresse email invalide' });
    newEmail = v || null;
  }

  // Rappels d'expiration : réservés aux rôles admin et éditeur, réglés par l'utilisateur lui-même
  const canReceive = user.role === 'admin' || user.role === 'editeur';
  let newNotifyExpiry = user.notify_expiry === 1;
  if (canReceive && notify_expiry !== undefined) {
    newNotifyExpiry = !!notify_expiry;
  }
  let newNotifyDays = user.notify_expiry_days ?? 7;
  if (canReceive && notify_expiry_days !== undefined) {
    const d = parseInt(notify_expiry_days, 10);
    if (!Number.isNaN(d)) newNotifyDays = Math.max(1, Math.min(365, d));
  }
  let newNotifyHour = user.notify_expiry_hour ?? 8;
  if (canReceive && notify_expiry_hour !== undefined) {
    const h = parseInt(notify_expiry_hour, 10);
    if (!Number.isNaN(h)) newNotifyHour = Math.max(0, Math.min(23, h));
  }

  const changed =
    newUsername !== user.username ||
    newEmail !== user.email ||
    !!newPassword ||
    newNotifyExpiry !== (user.notify_expiry === 1) ||
    newNotifyDays !== (user.notify_expiry_days ?? 7) ||
    newNotifyHour !== (user.notify_expiry_hour ?? 8);

  if (changed) {
    db.prepare('UPDATE users SET username = ?, email = ?, notify_expiry = ?, notify_expiry_days = ?, notify_expiry_hour = ? WHERE id = ?')
      .run(newUsername, newEmail, newNotifyExpiry ? 1 : 0, newNotifyDays, newNotifyHour, user.id);
    if (newPassword) {
      db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync(newPassword, 10), user.id);
    }
  }

  const changes = [];
  if (newUsername !== user.username) changes.push('nom d\'utilisateur');
  if (newEmail !== user.email) changes.push('email');
  if (newPassword) changes.push('mot de passe');
  if (newNotifyExpiry !== (user.notify_expiry === 1)) changes.push('rappels d\'expiration');
  if (newNotifyDays !== (user.notify_expiry_days ?? 7) || newNotifyHour !== (user.notify_expiry_hour ?? 8)) changes.push('réglage des rappels');
  logAudit({ user: req.user, action: 'Modification du profil', category: 'profile', target: newUsername, detail: changes.join(', ') || null });

  res.json({
    id: user.id,
    username: newUsername,
    role: user.role,
    email: newEmail,
    notify_expiry: newNotifyExpiry,
    notify_expiry_days: newNotifyDays,
    notify_expiry_hour: newNotifyHour
  });
});

// Envoi immédiat du rappel d'expiration à l'utilisateur connecté (selon son réglage)
router.post('/profile/send-expiry', requireAuth, requireEditor, async (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(401).json({ error: 'Utilisateur introuvable' });
  try {
    const result = await sendExpiryReminderForUser(user);
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Préférences d'affichage propres à l'utilisateur (ordre/visibilité des colonnes…).
// Stockées côté serveur pour suivre l'utilisateur d'un poste/navigateur à l'autre.
router.get('/preferences', requireAuth, (req, res) => {
  const row = db.prepare('SELECT preferences FROM users WHERE id = ?').get(req.user.id);
  let prefs = {};
  if (row && row.preferences) {
    try { prefs = JSON.parse(row.preferences) || {}; } catch { prefs = {}; }
  }
  res.json(prefs);
});

router.put('/preferences', requireAuth, (req, res) => {
  const body = req.body;
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return res.status(400).json({ error: 'Préférences invalides' });
  }
  let json;
  try { json = JSON.stringify(body); } catch { return res.status(400).json({ error: 'Préférences invalides' }); }
  if (json.length > 50000) return res.status(413).json({ error: 'Préférences trop volumineuses' });
  db.prepare('UPDATE users SET preferences = ? WHERE id = ?').run(json, req.user.id);
  res.json({ ok: true });
});

// Mot de passe oublié : envoie un lien de réinitialisation si l'email existe
router.post('/forgot-password', async (req, res) => {
  const { email } = req.body || {};
  const v = String(email || '').trim().toLowerCase();
  if (!v || !EMAIL_RE.test(v)) {
    return res.status(400).json({ error: 'Adresse email invalide' });
  }
  if (!smtpConfigured()) {
    return res.status(400).json({ error: 'L\'envoi d\'emails n\'est pas configuré — contactez un administrateur' });
  }

  const user = db.prepare('SELECT * FROM users WHERE lower(email) = ?').get(v);
  if (!user) {
    // Réponse volontairement neutre pour ne pas révéler l'existence du compte
    return res.json({ ok: true });
  }

  try {
    const token = createResetToken(user.id);
    await sendPasswordEmailWithToken({
      to: user.email,
      token,
      subject: 'Contrats — réinitialisation de votre mot de passe',
      intro: `Bonjour ${user.username}, une réinitialisation de votre mot de passe a été demandée.`,
      note: 'Ce lien expire dans 24 heures. Si vous n\'êtes pas à l\'origine de cette demande, ignorez cet email.'
    });
    res.json({ ok: true });
  } catch (err) {
    console.error('[auth] Échec envoi email de reset:', err.message);
    res.status(500).json({ error: 'Impossible d\'envoyer l\'email — réessayez plus tard' });
  }
});

// Définit le nouveau mot de passe depuis le lien reçu par email
router.post('/reset-password', (req, res) => {
  const { token, newPassword } = req.body || {};
  if (!token) return res.status(400).json({ error: 'Lien invalide' });
  if (!newPassword || newPassword.length < 6) {
    return res.status(400).json({ error: 'Le mot de passe doit faire au moins 6 caractères' });
  }

  const reset = consumeResetToken(String(token));
  if (!reset) return res.status(400).json({ error: 'Lien invalide ou expiré — demandez un nouvel email' });

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(reset.userId);
  if (!user) return res.status(400).json({ error: 'Utilisateur introuvable' });

  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync(newPassword, 10), user.id);
  logAudit({ user, action: 'Réinitialisation du mot de passe', category: 'profile', target: user.username });
  res.json({ ok: true });
});

module.exports = router;