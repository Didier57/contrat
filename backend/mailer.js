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

// Utilisateurs abonnés aux rappels (admin/éditeur actifs avec email) + leurs réglages
function expirySubscribers() {
  return db
    .prepare(
      `SELECT id, email, notify_expiry_days, notify_expiry_hour, notify_expiry_last
       FROM users
       WHERE notify_expiry = 1 AND active = 1 AND role IN ('admin', 'editeur')
         AND email IS NOT NULL AND email != ''`
    )
    .all();
}

function expiryRecipients() {
  return expirySubscribers().map((r) => r.email);
}

// Email de notif de connexion → les autres admins (jamais l'utilisateur qui se connecte)
async function sendLoginNotification(user) {
  if (!getBool('notify.login', false)) return;
  const recipients = db
    .prepare(
      `SELECT email FROM users
       WHERE role = 'admin' AND id != ? AND email IS NOT NULL AND email != ''`
    )
    .all(user.id)
    .map((r) => r.email);
  if (!recipients.length) return;
  const username = user.username;
  const role = user.role;
  const moment = new Date().toLocaleString('fr-FR');
  try {
    await sendMail({
      to: recipients,
      subject: 'Contrats — Connexion détectée',
      html: `
        <p>Une connexion a été détectée sur l'application <b>Contrats</b> :</p>
        <ul>
          <li><b>Utilisateur</b> : ${escapeHtml(username)}</li>
          <li><b>Rôle</b> : ${role === 'admin' ? 'administrateur' : role === 'editeur' ? 'éditeur' : 'lecteur'}</li>
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

// Corps HTML du rappel d'expiration (liste des contrats)
function expiryEmailHtml(contracts, days) {
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

  return `
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
  `;
}

// Rappel d'expiration → un utilisateur donné, selon SON nombre de jours
async function sendExpiryReminderForUser(user) {
  if (!smtpConfigured()) {
    throw new Error('SMTP non configuré — renseignez l\'hôte, le port et l\'expéditeur dans Paramètres');
  }
  if (!user.email) {
    throw new Error('Aucune adresse email — renseignez-la dans votre profil');
  }
  const days = Number(user.notify_expiry_days) > 0 ? Number(user.notify_expiry_days) : 7;
  const contracts = expiringContracts(days);
  if (!contracts.length) {
    return { sent: 0, count: 0, days, notice: `Aucun contrat à signaler dans les ${days} prochains jours` };
  }
  await sendMail({
    to: user.email,
    subject: `Contrats — ${contracts.length} contrat(s) expire(nt) dans les ${days} jours`,
    html: expiryEmailHtml(contracts, days)
  });
  console.log(`[mailer] Rappel d'expiration envoyé à ${user.email} : ${contracts.length} contrat(s)`);
  return { sent: 1, count: contracts.length, days };
}

// Job horaire : envoie le rappel à chaque abonné dont l'heure est atteinte (une fois par jour)
async function sendDueExpiryReminders() {
  if (!smtpConfigured()) return { sent: 0 };
  const hour = new Date().getHours();
  const today = localToday();
  let sent = 0;
  for (const user of expirySubscribers()) {
    if (Number(user.notify_expiry_hour ?? 8) > hour) continue;
    if (user.notify_expiry_last === today) continue;
    try {
      await sendExpiryReminderForUser(user);
      db.prepare('UPDATE users SET notify_expiry_last = ? WHERE id = ?').run(today, user.id);
      sent++;
    } catch (err) {
      console.error(`[mailer] Échec rappel pour ${user.email}:`, err.message);
    }
  }
  return { sent };
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Adresse publique de l'application (réglable dans Paramètres), sinon valeur config/env
function appUrl() {
  const configured = String(getSetting('app.url', '') || '').trim();
  const base = configured || APP_URL;
  return String(base).replace(/\/+$/, '');
}

function resetLink(token) {
  return `${appUrl()}/reset?token=${encodeURIComponent(token)}`;
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
  sendExpiryReminderForUser,
  sendDueExpiryReminders,
  sendPasswordEmailWithToken,
  adminEmails,
  expiryRecipients,
  smtpConfigured,
  getSmtpConfig,
  isTodayDone,
  markTodayDone,
  expiringContracts
};