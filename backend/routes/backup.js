const express = require('express');
const multer = require('multer');
const db = require('../db');
const { requireAuth, requireAdmin } = require('../auth');
const { buildBackupWorkbook, importBackup, backupFilename, sqlDump, restoreSql, sqlFilename } = require('../backup');
const { sendMail, smtpConfigured } = require('../mailer');
const { logAudit } = require('../audit');
const { getSetting, setSetting, getBool, getInt } = require('../settings');
const { getSmbConfig, smbConfigured, runBackup, runDueBackup, listBackups, restoreRemote, deleteRemote } = require('../smb-backup');
const smb = require('../smb');

const router = express.Router();
router.use(requireAuth, requireAdmin);

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

// GET /api/backup/export — télécharge le classeur complet de sauvegarde
router.get('/export', (req, res) => {
  const buf = buildBackupWorkbook();
  logAudit({ user: req.user, action: 'Export de la sauvegarde', category: 'backup', target: backupFilename() });
  res.setHeader('Content-Type', XLSX_MIME);
  res.setHeader('Content-Disposition', `attachment; filename="${backupFilename()}"`);
  res.setHeader('Content-Length', buf.length);
  res.send(buf);
});

// GET /api/backup/sql — télécharge un dump SQL complet (structure + données)
router.get('/sql', (req, res) => {
  const sql = sqlDump();
  logAudit({ user: req.user, action: 'Export de la sauvegarde SQL', category: 'backup', target: sqlFilename() });
  res.setHeader('Content-Type', 'application/sql; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${sqlFilename()}"`);
  res.setHeader('Content-Length', Buffer.byteLength(sql));
  res.send(sql);
});

// POST /api/backup/sql/restore — restaure la base depuis un dump SQL
router.post('/sql/restore', upload.single('file'), (req, res) => {
  if (!req.file) {
    logAudit({ user: req.user, action: 'Échec de la restauration SQL', category: 'backup', detail: 'fichier manquant' });
    return res.status(400).json({ error: 'Fichier SQL manquant' });
  }
  try {
    const result = restoreSql(req.file.buffer);
    logAudit({ user: req.user, action: 'Restauration SQL de la base', category: 'backup', target: req.file.originalname });
    res.json({ ok: true, message: 'Base restaurée depuis le fichier SQL', ...result });
  } catch (e) {
    logAudit({ user: req.user, action: 'Échec de la restauration SQL', category: 'backup', target: req.file.originalname, detail: e.message });
    res.status(400).json({ error: `Restauration impossible : ${e.message}` });
  }
});

// POST /api/backup/import — restaure la base depuis un classeur sauvegardé
router.post('/import', upload.single('file'), (req, res) => {
  if (!req.file) {
    logAudit({ user: req.user, action: 'Échec de la restauration', category: 'backup', detail: 'fichier manquant' });
    return res.status(400).json({ error: 'Fichier Excel manquant' });
  }
  try {
    const result = importBackup(req.file.buffer);
    logAudit({ user: req.user, action: 'Restauration de la base', category: 'backup', target: req.file.originalname });
    res.json({ ok: true, message: 'Base restaurée depuis le fichier Excel', ...result });
  } catch (e) {
    logAudit({ user: req.user, action: 'Échec de la restauration', category: 'backup', target: req.file.originalname, detail: e.message });
    res.status(400).json({ error: `Import impossible : ${e.message}` });
  }
});

// POST /api/backup/send — envoie la sauvegarde Excel par email à l'admin demandeur
router.post('/send', async (req, res) => {
  if (!smtpConfigured()) {
    return res.status(400).json({ error: 'SMTP non configuré — rendez-vous dans Paramètres' });
  }
  const user = db.prepare('SELECT email FROM users WHERE id = ?').get(req.user.id);
  if (!user || !user.email) {
    return res.status(400).json({ error: "Aucune adresse email sur votre compte (menu Profil)" });
  }
  const to = user.email;
  try {
    const buf = buildBackupWorkbook();
    await sendMail({
      to,
      subject: `Contrats — Sauvegarde de la base (${backupFilename()})`,
      html:
        '<p>Suite à votre demande, voici la sauvegarde complète de la base de données Contrats.</p>' +
        `<p>Fichier : <b>${backupFilename()}</b></p>` +
        '<p>Conservez ce fichier : il permet de restaurer la base en cas de problème (page Sauvegarde → Importer).</p>',
      attachments: [{ filename: backupFilename(), content: buf }]
    });
    logAudit({ user: req.user, action: 'Sauvegarde envoyée par email', category: 'backup', target: backupFilename() });
    res.json({ ok: true, message: `Sauvegarde envoyée à ${to}` });
  } catch (e) {
    res.status(500).json({ error: `Envoi impossible : ${e.message}` });
  }
});

// ---------------------------------------------------------------------------
// Sauvegarde / restauration via un partage SMB
// ---------------------------------------------------------------------------

// GET /api/backup/smb — configuration SMB (le mot de passe n'est jamais renvoyé)
router.get('/smb', (req, res) => {
  const cfg = getSmbConfig();
  res.json({
    host: cfg.host,
    share: cfg.share,
    domain: cfg.domain,
    user: cfg.user,
    dir: cfg.dir,
    enabled: cfg.enabled,
    passSet: !!cfg.pass,
    auto_enabled: getBool('smb.auto_enabled', false),
    day: getInt('smb.day', 1),
    hour: getInt('smb.hour', 3),
    keep: getInt('smb.keep', 7),
    last: getSetting('smb.last', '') || '',
    last_check: getSetting('smb.last_check', '') || '',
    last_result: getSetting('smb.last_result', '') || ''
  });
});

// PUT /api/backup/smb — enregistre la configuration SMB
router.put('/smb', (req, res) => {
  const b = req.body || {};
  if (b.host !== undefined) setSetting('smb.host', String(b.host).trim());
  if (b.share !== undefined) setSetting('smb.share', String(b.share).trim());
  if (b.domain !== undefined) setSetting('smb.domain', String(b.domain).trim());
  if (b.user !== undefined) setSetting('smb.user', String(b.user).trim());
  if (b.dir !== undefined) setSetting('smb.dir', String(b.dir).trim().replace(/^[\\/]+|[\\/]+$/g, ''));
  if (b.pass !== undefined && b.pass !== '') setSetting('smb.pass', String(b.pass));
  if (b.enabled !== undefined) setSetting('smb.enabled', b.enabled ? '1' : '0');
  if (b.auto_enabled !== undefined) {
    setSetting('smb.auto_enabled', b.auto_enabled ? '1' : '0');
    // La sauvegarde automatique implique le stockage SMB : on coche aussi l'interrupteur principal.
    if (b.auto_enabled) setSetting('smb.enabled', '1');
  }
  if (b.day !== undefined) setSetting('smb.day', String(Math.min(7, Math.max(0, parseInt(b.day, 10) || 0))));
  if (b.hour !== undefined) setSetting('smb.hour', String(Math.min(23, Math.max(0, parseInt(b.hour, 10) || 0))));
  if (b.keep !== undefined) setSetting('smb.keep', String(Math.min(365, Math.max(1, parseInt(b.keep, 10) || 7))));
  logAudit({ user: req.user, action: 'Modification de la configuration SMB', category: 'backup', target: getSmbConfig().host });
  res.json({ ok: true });
});

// POST /api/backup/smb/test — teste la connexion et l'accès au dossier
router.post('/smb/test', async (req, res) => {
  try {
    const cfg = getSmbConfig();
    if (!smbConfigured(cfg)) return res.status(400).json({ error: "Renseignez l'hôte et le partage SMB" });
    const info = await smb.testConnection(cfg);
    const files = await smb.listFiles(cfg, cfg.dir);
    res.json({ ok: true, message: `Connexion réussie — ${info.count} élément(s), ${files.length} fichier(s) dans le dossier` });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// GET /api/backup/smb/files — liste les sauvegardes présentes sur le SMB
router.get('/smb/files', async (req, res) => {
  try {
    res.json({ ok: true, files: await listBackups() });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// POST /api/backup/smb/run — lance une sauvegarde SQL immédiate vers le SMB
router.post('/smb/run', async (req, res) => {
  try {
    const result = await runBackup('manuelle');
    res.json({ ok: true, ...result, message: `Sauvegarde « ${result.name} » envoyée (${result.pruned.length} ancienne(s) supprimée(s))` });
  } catch (e) {
    res.status(400).json({ error: `Sauvegarde impossible : ${e.message}` });
  }
});

// POST /api/backup/smb/run-due — évalue la planification et sauvegarde si c'est dû
router.post('/smb/run-due', async (req, res) => {
  try {
    const result = await runDueBackup();
    if (result.skipped) return res.json({ ok: true, skipped: result.skipped, message: `Sauvegarde non déclenchée — ${result.skipped}` });
    res.json({ ok: true, ...result, message: `Sauvegarde « ${result.name} » envoyée` });
  } catch (e) {
    res.status(400).json({ error: `Sauvegarde impossible : ${e.message}` });
  }
});

function safeRemoteName(name) {
  const n = String(name || '');
  if (!n || /[\\/]/.test(n) || n.includes('..')) return null;
  return n;
}

// POST /api/backup/smb/restore — restaure la base depuis un fichier présent sur le SMB
router.post('/smb/restore', async (req, res) => {
  const name = safeRemoteName(req.body && req.body.name);
  if (!name) return res.status(400).json({ error: 'Nom de fichier invalide' });
  try {
    const result = await restoreRemote(name);
    res.json({ ok: true, message: `Base restaurée depuis ${name}`, ...result });
  } catch (e) {
    res.status(400).json({ error: `Restauration impossible : ${e.message}` });
  }
});

// POST /api/backup/smb/delete — supprime un fichier de sauvegarde sur le SMB
router.post('/smb/delete', async (req, res) => {
  const name = safeRemoteName(req.body && req.body.name);
  if (!name) return res.status(400).json({ error: 'Nom de fichier invalide' });
  try {
    await deleteRemote(name);
    res.json({ ok: true, message: 'Fichier supprimé' });
  } catch (e) {
    res.status(400).json({ error: `Suppression impossible : ${e.message}` });
  }
});

module.exports = router;