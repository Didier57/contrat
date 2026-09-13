const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const config = require('./config');
const { seed, ensureDefaultAdmin } = require('./seed');
const { sendExpiryReminder, isTodayDone, markTodayDone } = require('./mailer');
const { getBool, getInt } = require('./settings');

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

// Job quotidien : rappel automatique des contrats qui expirent
// (vérifié toutes les 60 min ; exécuté une seule fois par jour à partir de notify.daily_hour)
setInterval(() => {
  if (!getBool('notify.expiry', false)) return;
  if (isTodayDone()) return;
  const hour = new Date().getHours();
  if (hour < getInt('notify.daily_hour', 8)) return;
  markTodayDone();
  sendExpiryReminder({ force: false }).catch((err) =>
    console.error('[mailer] Échec rappel quotidien :', err.message)
  );
}, 60 * 60 * 1000);