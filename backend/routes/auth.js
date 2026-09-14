const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const QRCode = require('qrcode');
const db = require('../db');
const { JWT_SECRET } = require('../config');
const { sign, requireAuth, requireEditor } = require('../auth');
const { sendLoginNotification, sendPasswordEmailWithToken, sendExpiryReminderForUser, smtpConfigured } = require('../mailer');
const { createResetToken, verifyResetToken, consumeResetToken } = require('../reset-token');
const { generateSecret, verifyTotp, keyuri } = require('../totp');
const { logAudit } = require('../audit');

const router = express.Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function publicUser(user) {
  return {
    id: user.id,
    username: user.username,
    role: user.role,
    email: user.email,
    notify_expiry: user.notify_expiry === 1,
    notify_expiry_days: user.notify_expiry_days ?? 7,
    notify_expiry_hour: user.notify_expiry_hour ?? 8,
    totp_enabled: user.totp_enabled === 1
  };
}

// Finalise une connexion réussie (notification, journal, jeton + profil)
function completeLogin(user, res) {
  sendLoginNotification(user);
  logAudit({ user, action: 'Connexion', category: 'login', target: user.username });
  res.json({ token: sign(user), user: publicUser(user) });
}

// Jeton éphémère (5 min) attestant que le mot de passe a bien été validé (étape 2FA)
function challengeToken(user) {
  return jwt.sign({ id: user.id, p: '2fa' }, JWT_SECRET, { expiresIn: '5m' });
}

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
  // Double authentification activée : mot de passe validé, on demande le code OTP
  if (user.totp_enabled === 1) {
    return res.json({ twoFactorRequired: true, challenge: challengeToken(user) });
  }
  completeLogin(user, res);
});

// Deuxième étape de connexion : vérification du code TOTP
router.post('/login/verify', (req, res) => {
  const { challenge, code } = req.body || {};
  if (!challenge) return res.status(400).json({ error: 'Demande invalide — reconnectez-vous' });
  let payload;
  try {
    payload = jwt.verify(challenge, JWT_SECRET);
  } catch {
    return res.status(400).json({ error: 'Délai dépassé — reconnectez-vous' });
  }
  if (!payload || payload.p !== '2fa') {
    return res.status(400).json({ error: 'Demande invalide — reconnectez-vous' });
  }
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(payload.id);
  if (!user || user.active !== 1 || user.totp_enabled !== 1) {
    return res.status(401).json({ error: 'Authentification impossible — reconnectez-vous' });
  }
  if (!verifyTotp(code, user.totp_secret)) {
    logAudit({ user, action: 'Échec de la double authentification', category: 'login', target: user.username });
    return res.status(401).json({ error: 'Code de vérification invalide' });
  }
  completeLogin(user, res);
});

router.get('/me', requireAuth, (req, res) => {
  const user = db.prepare('SELECT id, username, role, email, notify_expiry, notify_expiry_days, notify_expiry_hour, totp_enabled FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(401).json({ error: 'Utilisateur introuvable' });
  res.json({ ...user, notify_expiry: user.notify_expiry === 1, totp_enabled: user.totp_enabled === 1 });
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
    logAudit({
      user: req.user,
      action: 'Envoi manuel du rappel d\'expiration',
      category: 'profile',
      target: user.username,
      detail: result.notice || `${result.count} contrat(s) sur ${result.days} jours`
    });
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

// --- Double authentification (TOTP, optionnelle) ---

// Génère un secret + QR code pour l'enrôlement (n'active pas encore la 2FA)
router.post('/2fa/setup', requireAuth, async (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(401).json({ error: 'Utilisateur introuvable' });
  if (user.totp_enabled === 1) {
    return res.status(400).json({ error: 'La double authentification est déjà activée' });
  }
  const secret = generateSecret();
  db.prepare('UPDATE users SET totp_secret = ?, totp_enabled = 0 WHERE id = ?').run(secret, user.id);
  const uri = keyuri(secret, user.username);
  let qr = null;
  try {
    qr = await QRCode.toDataURL(uri, { width: 220, margin: 1 });
  } catch {
    qr = null; // le client peut toujours saisir le secret manuellement
  }
  res.json({ secret, otpauth_url: uri, qr });
});

// Active la 2FA après vérification du premier code
router.post('/2fa/enable', requireAuth, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(401).json({ error: 'Utilisateur introuvable' });
  if (user.totp_enabled === 1) return res.status(400).json({ error: 'La double authentification est déjà activée' });
  if (!user.totp_secret) return res.status(400).json({ error: 'Commencez par générer le QR code d\'activation' });
  if (!verifyTotp((req.body || {}).code, user.totp_secret)) {
    return res.status(400).json({ error: 'Code invalide — vérifiez l\'heure de votre téléphone et réessayez' });
  }
  db.prepare('UPDATE users SET totp_enabled = 1 WHERE id = ?').run(user.id);
  logAudit({ user: req.user, action: 'Activation de la double authentification', category: 'profile', target: user.username });
  res.json({ ok: true, totp_enabled: true });
});

// Désactive la 2FA : code OTP valide OU mot de passe correct
router.post('/2fa/disable', requireAuth, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(401).json({ error: 'Utilisateur introuvable' });
  const { code, password } = req.body || {};
  if (user.totp_enabled === 1) {
    const codeOk = verifyTotp(code, user.totp_secret);
    const passOk = !!password && bcrypt.compareSync(password, user.password_hash);
    if (!codeOk && !passOk) {
      return res.status(400).json({ error: 'Saisissez un code valide ou votre mot de passe pour désactiver' });
    }
  }
  db.prepare('UPDATE users SET totp_secret = NULL, totp_enabled = 0 WHERE id = ?').run(user.id);
  logAudit({ user: req.user, action: 'Désactivation de la double authentification', category: 'profile', target: user.username });
  res.json({ ok: true, totp_enabled: false });
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
    logAudit({ action: 'Demande de réinitialisation (email inconnu)', category: 'profile', target: v });
    return res.json({ ok: true });
  }

  try {
    const token = createResetToken(user.id);
    await sendPasswordEmailWithToken({
      to: user.email,
      token,
      subject: 'Contrats — réinitialisation de votre mot de passe',
      intro: `Bonjour ${user.username}, une réinitialisation de votre mot de passe a été demandée.`,
      note: 'Ce lien expire dans 72 heures. Si vous n\'êtes pas à l\'origine de cette demande, ignorez cet email.'
    });
    logAudit({ user, action: 'Demande de réinitialisation du mot de passe', category: 'profile', target: user.username, detail: user.email });
    res.json({ ok: true });
  } catch (err) {
    console.error('[auth] Échec envoi email de reset:', err.message);
    res.status(500).json({ error: 'Impossible d\'envoyer l\'email — réessayez plus tard' });
  }
});

// Vérifie la validité d'un lien (sans le consommer) — utilisé par la page de réinitialisation
router.get('/reset-password/verify', (req, res) => {
  const token = String(req.query.token || '');
  if (!token) return res.json({ valid: false, reason: 'missing' });
  const check = verifyResetToken(token);
  res.json({ valid: check.valid, reason: check.valid ? 'valid' : check.reason });
});

// Définit le nouveau mot de passe depuis le lien reçu par email
router.post('/reset-password', (req, res) => {
  const { token, newPassword } = req.body || {};
  if (!token) return res.status(400).json({ error: 'Lien invalide' });
  if (!newPassword || newPassword.length < 6) {
    return res.status(400).json({ error: 'Le mot de passe doit faire au moins 6 caractères' });
  }

  const check = verifyResetToken(String(token));
  if (!check.valid) {
    const messages = {
      used: 'Ce lien a déjà été utilisé — connectez-vous ou demandez un nouvel email',
      expired: 'Ce lien a expiré — demandez un nouvel email',
    };
    return res.status(400).json({ error: messages[check.reason] || 'Lien invalide ou expiré — demandez un nouvel email' });
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