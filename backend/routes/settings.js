const express = require('express');
const { requireAuth, requireAdmin } = require('../auth');
const { getSetting, setSetting, getBool, getInt } = require('../settings');
const { sendMail, smtpConfigured, sendExpiryReminder } = require('../mailer');
const { logAudit } = require('../audit');

const router = express.Router();
router.use(requireAuth);
router.use(requireAdmin);

// Lecture des paramètres (le mot de passe SMTP n'est jamais renvoyé)
router.get('/', (req, res) => {
  const pass = getSetting('smtp.pass', process.env.SMTP_PASS || '');
  res.json({
    smtp: {
      host: getSetting('smtp.host', process.env.SMTP_HOST || ''),
      port: getInt('smtp.port', parseInt(process.env.SMTP_PORT || '587', 10)),
      secure: getBool('smtp.secure', process.env.SMTP_SECURE === 'true'),
      user: getSetting('smtp.user', process.env.SMTP_USER || ''),
      from: getSetting('smtp.from', process.env.SMTP_FROM || ''),
      from_name: getSetting('smtp.from_name', ''),
      passSet: !!pass
    },
    smtpConfigured: smtpConfigured(),
    notify: {
      login: getBool('notify.login', false),
      expiryDays: getInt('notify.expiry_days', 7),
      dailyHour: getInt('notify.daily_hour', 8)
    }
  });
});

// Sauvegarde des paramètres
router.put('/', (req, res) => {
  const { smtp, notify } = req.body || {};

  const boolKeys = ['secure'];
  ['host', 'port', 'secure', 'user', 'pass', 'from', 'from_name'].forEach((k) => {
    const v = smtp && smtp[k];
    if (v === undefined) return;
    if (k === 'pass' && String(v) === '') return; // champ vide = ne pas modifier
    setSetting(`smtp.${k}`, boolKeys.includes(k) ? (v ? '1' : '0') : v);
  });

  ['login'].forEach((k) => {
    const v = notify && notify[k];
    if (v === undefined) return;
    setSetting(`notify.${k}`, v ? '1' : '0');
  });
  if (notify && notify.expiryDays !== undefined) {
    const d = parseInt(notify.expiryDays, 10);
    setSetting('notify.expiry_days', Number.isNaN(d) ? 7 : Math.max(1, Math.min(365, d)));
  }
  if (notify && notify.dailyHour !== undefined) {
    const h = parseInt(notify.dailyHour, 10);
    setSetting('notify.daily_hour', Number.isNaN(h) ? 8 : Math.max(0, Math.min(23, h)));
  }

  const sections = [];
  if (smtp && (smtp.host !== undefined || smtp.port !== undefined || smtp.secure !== undefined || smtp.user !== undefined || smtp.pass !== undefined || smtp.from !== undefined || smtp.from_name !== undefined)) sections.push('SMTP');
  if (notify && (notify.login !== undefined || notify.expiryDays !== undefined || notify.dailyHour !== undefined)) sections.push('Notifications');
  logAudit({
    user: req.user,
    action: 'Modification des paramètres',
    category: 'settings',
    detail: sections.join(', ') || 'Paramètres'
  });

  res.json({ ok: true, smtpConfigured: smtpConfigured() });
});

// Email de test
router.post('/test', async (req, res) => {
  try {
    const to = req.body && req.body.to ? String(req.body.to).trim() : req.user.email;
    if (!to) return res.status(400).json({ error: 'Aucune adresse email pour l\'envoi de test' });
    await sendMail({
      to,
      subject: 'Contrats — email de test',
      html: '<p>Test réussi : votre configuration SMTP fonctionne correctement.</p>'
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Envoi manuel du rappel des contrats expirant sous N jours
router.post('/send-expiry', async (req, res) => {
  try {
    const result = await sendExpiryReminder({ force: true });
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;