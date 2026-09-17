const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const config = require('./config');
const { seed, ensureDefaultAdmin } = require('./seed');
const { sendDueExpiryReminders } = require('./mailer');
const { runDueBackup } = require('./smb-backup');

// Garde-fous : une librairie tierce (SMB, etc.) ne doit jamais tuer le serveur
process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err && err.stack ? err.stack : err);
});
process.on('unhandledRejection', (err) => {
  console.error('[unhandledRejection]', err && err.stack ? err.stack : err);
});

seed();
ensureDefaultAdmin();

const app = express();
app.use(cors());
app.use(express.json({ limit: '5mb' }));

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/contracts', require('./routes/contracts'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/export', require('./routes/export'));
app.use('/api/users', require('./routes/users'));
app.use('/api/settings', require('./routes/settings'));
app.use('/api/backup', require('./routes/backup'));
app.use('/api/activity', require('./routes/activity'));

// Santé
app.get('/api/health', (req, res) => res.json({ ok: true }));

// 404 API
app.use('/api', (req, res) => res.status(404).json({ error: 'Route inconnue' }));

// Production : sert le build frontend + fallback SPA (répertoire ../frontend/dist)
const distPath = path.join(__dirname, '..', 'frontend', 'dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  app.get('*', (req, res) => res.sendFile(path.join(distPath, 'index.html')));
}

// Gestion erreurs
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Erreur serveur' });
});

app.listen(config.PORT, () => {
  console.log(`API démarrée sur http://localhost:${config.PORT}`);
});

// Job horaire : rappel automatique des contrats qui expirent.
// Chaque utilisateur abonné a sa propre heure (notify_expiry_hour) et son propre délai (notify_expiry_days).
setInterval(() => {
  sendDueExpiryReminders().catch((err) =>
    console.error('[mailer] Échec rappel quotidien :', err.message)
  );
}, 60 * 60 * 1000);

// Sauvegarde automatique SMB : vérification toutes les 15 minutes.
function checkSmbBackup() {
  runDueBackup()
    .then((r) => {
      if (r && r.name) console.log('[smb] Sauvegarde automatique effectuée :', r.name);
      else if (r && r.skipped && r.skipped !== "déjà effectuée aujourd'hui") console.log('[smb] Sauvegarde automatique ignorée :', r.skipped);
    })
    .catch((err) => console.error('[smb] Échec sauvegarde automatique :', err.message));
}
setInterval(checkSmbBackup, 15 * 60 * 1000);
// Première vérification peu après le démarrage (si une sauvegarde est due).
setTimeout(checkSmbBackup, 30 * 1000);