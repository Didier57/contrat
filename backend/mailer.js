const nodemailer = require('nodemailer');
const db = require('./db');
const { getSetting, getBool, getInt, setSetting } = require('./settings');
const { APP_URL } = require('./config');

const ENV_DEFAULTS = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_SECURE', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM'];

function getSmtpConfig() {
  return {
    host: getSetting('smtp.host', process.env.SMTP_HOST || ''),
    port: getInt('smtp.port', parseInt(process.env.SMTP_PORT || '587', 10)),
    secure: getBool('smtp.secure', process.env.SMTP_SECURE === 'true'),
    user: getSetting('smtp.user', process.env.SMTP_USER || ''),
    pass: getSetting('smtp.pass', process.env.SMTP_PASS || ''),
    from: getSetting('smtp.from', process.env.SMTP_FROM || ''),
    from_name: getSetting('smtp.from_name', '')
  };
}

// Adresse d'expéditeur : "Nom affiché" <email> quand le nom est renseigné
function buildFrom(addr, name) {
  const a = String(addr || '').trim();
  const n = String(name || '').trim();
  if (!a) return a;
  if (/<[^>]+>/.test(a)) return a; // déjà "Nom" <email>
  return n ? `"${n.replace(/"/g, '\\"')}" <${a}>` : a;
}

function smtpConfigured() {
  const c = getSmtpConfig();
  return !!(c.host && c.port && c.from);
}

// Envoie un email via le SMTP configuré (dans la table settings)
async function sendMail({ to, subject, html, text = '', attachments = [] }) {
  const c = getSmtpConfig();
  if (!c.host || !c.port || !c.from) {
    throw new Error('SMTP non configuré (hôte, port et expéditeur requis)');
  }
  if (!to) {
    throw new Error('Aucun destinataire (email) défini');
  }

  const transporter = nodemailer.createTransport({
    host: c.host,
    port: c.port,
    secure: c.secure,
    auth: c.user ? { user: c.user, pass: c.pass } : undefined
    // Sans ignoreTLS : sur 587/25, STARTTLS est utilisé si le serveur le propose.
    // (ignoreTLS: true forçait le plaintext et faisait échouer les serveurs exigeant TLS.)
  });

  try {
    const info = await transporter.sendMail({
      from: buildFrom(c.from, c.from_name),
      to,
      subject,
      text,
      html,
      attachments
    });
    console.log(`[mailer] Email envoyé → ${Array.isArray(to) ? to.join(', ') : to} (${c.host}:${c.port})`);
    if (info && info.rejected && info.rejected.length) {
      console.warn('[mailer] Destinataires rejetés:', info.rejected.join(', '));
    }
  } catch (err) {
    console.error(`[mailer] Échec d'envoi → ${c.host}:${c.port} — ${err.message}`);
    throw err;
  }
}

// Destinataires = emails des administrateurs
function adminEmails() {
  return db
    .prepare('SELECT email FROM users WHERE role = ? AND email IS NOT NULL AND email != ?')
    .all('admin', '')
    .map((r) => r.email);
}

// Email de notif de connexion → les admins
async function sendLoginNotification(username, role) {
  if (!getBool('notify.login', false)) return;
  const recipients = adminEmails();
  if (!recipients.length) return;
  const moment = new Date().toLocaleString('fr-FR');
  try {
    await sendMail({
      to: recipients,
      subject: 'Contrats — Connexion détectée',
      html: `
        <p>Une connexion a été détectée sur l'application <b>Contrats</b> :</p>
        <ul>
          <li><b>Utilisateur</b> : ${escapeHtml(username)}</li>
          <li><b>Rôle</b> : ${role === 'admin' ? 'administrateur' : 'lecteur'}</li>
          <li><b>Date / heure</b> : ${escapeHtml(moment)}</li>
        </ul>
        <p style="color:#666">Si ce n'était pas vous, vérifiez vos comptes.</p>
      `
    });
    console.log(`[mailer] Notification de connexion envoyée à ${recipients.length} admin(s)`);
  } catch (err) {
    console.error('[mailer] Échec notification de connexion:', err.message);
  }
}

// Contrats qui expirent dans les N prochains jours (0 ≤ jours restants ≤ limit). Déjà expirés exclus.
function expiringContracts(days) {
  const today = new Date();
  const rows = db
    .prepare(
      `SELECT id, customer_name, import_id, contract_end, contract_type, account_manager
       FROM contracts
       WHERE contract_end IS NOT NULL AND contract_end != ''`
    )
    .all();

  return rows
    .map((r) => {
      const end = new Date(r.contract_end + 'T00:00:00');
      if (Number.isNaN(end.getTime())) return null;
      const daysLeft = Math.ceil((end - today) / 86400000);
      return { ...r, daysLeft };
    })
    .filter((r) => r && r.daysLeft >= 0 && r.daysLeft <= days)
    .sort((a, b) => a.contract_end.localeCompare(b.contract_end));
}

// Rappel des expirations → les admins.
async function sendExpiryReminder({ force = false } = {}) {
  if (!smtpConfigured()) {
    throw new Error('SMTP non configuré — renseignez l\'hôte, le port et l\'expéditeur dans Paramètres');
  }
  const recipients = adminEmails();
  if (!recipients.length) {
    throw new Error('Aucun administrateur avec une adresse email — impossible d\'envoyer le rappel');
  }

  const days = getInt('notify.expiry_days', 7);
  const contracts = expiringContracts(days);
  if (!contracts.length) {
    return { recipients: recipients.length, notice: 'Aucun contrat à signaler dans les prochains jours', sent: 0 };
  }

  const today = new Date().toLocaleDateString('fr-FR');
  const rows = contracts
    .map(
      (r) => `
      <tr>
        <td style="padding:6px 10px;border:1px solid #dde3ea">${escapeHtml(r.customer_name || '')}</td>
        <td style="padding:6px 10px;border:1px solid #dde3ea">${escapeHtml(r.contract_type || '')}</td>
        <td style="padding:6px 10px;border:1px solid #dde3ea">${escapeHtml(r.account_manager || '')}</td>
        <td style="padding:6px 10px;border:1px solid #dde3ea;white-space:nowrap">${escapeHtml(r.contract_end)}</td>
        <td style="padding:6px 10px;border:1px solid #dde3ea;white-space:nowrap">${r.daysLeft} j</td>
      </tr>`
    )
    .join('');

  await sendMail({
    to: recipients,
    subject: `Contrats — ${contracts.length} contrat(s) expire(nt) dans les ${days} jours`,
    html: `
      <p>Bonjour,</p>
      <p>Voici les contrats qui expirent dans les <b>${days} prochains jours</b> (au ${today}) :</p>
      <table style="border-collapse:collapse;font-size:13px">
        <thead>
          <tr>
            <th style="padding:6px 10px;border:1px solid #dde3ea;text-align:left">Client</th>
            <th style="padding:6px 10px;border:1px solid #dde3ea;text-align:left">Type</th>
            <th style="padding:6px 10px;border:1px solid #dde3ea;text-align:left">Compte</th>
            <th style="padding:6px 10px;border:1px solid #dde3ea;text-align:left">Fin contrat</th>
            <th style="padding:6px 10px;border:1px solid #dde3ea;text-align:left">Jours restants</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <p style="color:#666">Application Contrats — ${escapeHtml(today)}</p>
    `
  });

  console.log(`[mailer] Rappel d'expiration envoyé : ${contracts.length} contrat(s) → ${recipients.length} admin(s)`);
  return { recipients: recipients.length, count: contracts.length };
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function resetLink(token) {
  return `${APP_URL}/reset?token=${encodeURIComponent(token)}`;
}

// Email de définition / réinitialisation du mot de passe (création de compte ou mot de passe oublié)
async function sendPasswordEmailWithToken({ to, token, subject, intro, note, username }) {
  const link = resetLink(token);
  await sendMail({
    to,
    subject,
    html: `
      <p>${escapeHtml(intro)}</p>
      ${username ? `<p style="font-size:14px;margin:0 0 14px"><b>NOM D'UTILISATEUR</b> : ${escapeHtml(username)}</p>` : ''}
      <p style="margin:18px 0">
        <a href="${link}" style="background:#1d4ed8;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600">
          Définir mon mot de passe
        </a>
      </p>
      ${note ? `<p style="color:#666;font-size:12px">${escapeHtml(note)}</p>` : ''}
      <p style="color:#666;font-size:12px">Si le bouton ne s'affiche pas, copiez ce lien : ${link}</p>
    `
  });
}

// Date du jour en heure locale (fuseau du serveur, ex. Europe/Paris)
function localToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Journal d'exécution quotidienne : stocke la date de la dernière passe auto
function isTodayDone() {
  return getSetting('reminders.last_daily', '') === localToday();
}

function markTodayDone() {
  setSetting('reminders.last_daily', localToday());
}

module.exports = {
  sendMail,
  sendLoginNotification,
  sendExpiryReminder,
  sendPasswordEmailWithToken,
  adminEmails,
  smtpConfigured,
  getSmtpConfig,
  isTodayDone,
  markTodayDone,
  expiringContracts
};