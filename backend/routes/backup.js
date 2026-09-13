const express = require('express');
const multer = require('multer');
const db = require('../db');
const { requireAuth, requireAdmin } = require('../auth');
const { buildBackupWorkbook, importBackup, backupFilename } = require('../backup');
const { sendMail, smtpConfigured } = require('../mailer');
const { logAudit } = require('../audit');

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

module.exports = router;