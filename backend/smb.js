'use strict';
// Accès SMB (partage réseau Windows) pour les sauvegardes.
// Toutes les opérations sont bornées dans le temps : si l'hôte ne répond pas,
// on détruit le socket et on renvoie un message clair au lieu de bloquer l'API.

const SMB2 = require('@marsaud/smb2');

const TIMEOUTS = { test: 15000, list: 20000, read: 60000, write: 120000 };

// Traduit les erreurs techniques en messages compréhensibles
function errMsg(e) {
  if (!e) return 'Erreur inconnue';
  const m = e && e.message ? String(e.message) : String(e);
  if (/délai dépassé/i.test(m)) return m;
  if (/ETIMEDOUT|timed?\s?out/i.test(m)) return 'Le serveur SMB ne répond pas (délai dépassé)';
  if (/ECONNREFUSED/i.test(m)) return 'Connexion refusée par le serveur SMB (vérifiez l’hôte et le port)';
  if (/ENOTFOUND/i.test(m)) return 'Nom du serveur SMB introuvable';
  if (/EHOSTUNREACH|ENETUNREACH/i.test(m)) return 'Serveur SMB injoignable (réseau)';
  if (/LOGON_FAILURE/i.test(m)) return 'Identifiants SMB refusés (utilisateur ou mot de passe)';
  if (/ACCESS_DENIED/i.test(m)) return 'Accès SMB refusé';
  if (/BAD_NETWORK_NAME|bad network name/i.test(m)) return 'Partage SMB introuvable sur le serveur';
  if (/share is not valid/i.test(m)) return 'Partage SMB invalide';
  return m;
}

// Le partage doit être au format \\hote\partage
function normalizeShare(cfg) {
  const raw = String((cfg && cfg.share) || '').trim();
  if (raw.startsWith('\\\\')) return raw;
  const host = String((cfg && cfg.host) || '').trim().replace(/^\\+/, '');
  const share = raw.replace(/^\\+/, '');
  if (!host || !share) throw new Error('Hôte et partage SMB requis');
  return '\\\\' + host + '\\' + share;
}

function cleanDir(dir) {
  return String(dir || '')
    .replace(/^[\\/]+/, '')
    .replace(/[\\/]+$/, '');
}

function joinRemote(dir, name) {
  const d = cleanDir(dir);
  return d ? d + '\\' + String(name) : String(name);
}

function createClient(cfg) {
  const client = new SMB2({
    share: normalizeShare(cfg),
    domain: String((cfg && cfg.domain) || ''),
    username: String((cfg && cfg.user) || ''),
    password: String((cfg && cfg.pass) || ''),
    port: Number(cfg && cfg.port) || 445,
    autoCloseTimeout: 0
  });
  // Toute erreur socket non rattachée à une opération est journalisée, jamais fatale
  try {
    const conn = client.connection || client._connection;
    if (conn && Array.isArray(conn.errorHandler) && !conn.errorHandler.length) {
      conn.errorHandler.push((err) => console.error('[smb] erreur socket :', errMsg(err)));
    }
  } catch (_) {
    /* ignore */
  }
  return client;
}

function safeDisconnect(client) {
  if (!client) return;
  try {
    if (typeof client.disconnect === 'function') client.disconnect();
  } catch (_) {
    /* ignore */
  }
  try {
    if (client.socket && typeof client.socket.destroy === 'function') client.socket.destroy();
  } catch (_) {
    /* ignore */
  }
}

function withTimeout(promise, ms, client) {
  let timer;
  const guard = new Promise((_, reject) => {
    timer = setTimeout(() => {
      try {
        if (client && client.socket) client.socket.destroy();
      } catch (_) {
        /* ignore */
      }
      reject(new Error('Le serveur SMB ne répond pas (délai dépassé)'));
    }, ms);
  });
  return Promise.race([promise, guard]).finally(() => clearTimeout(timer));
}

function readdir(client, dir) {
  return new Promise((resolve, reject) => {
    client.readdir(cleanDir(dir), { stats: true }, (err, list) => {
      if (err) return reject(err);
      resolve(Array.isArray(list) ? list : []);
    });
  });
}

async function withClient(cfg, timeout, fn) {
  let client;
  try {
    client = createClient(cfg);
    return await withTimeout(fn(client), timeout, client);
  } catch (e) {
    throw new Error(errMsg(e));
  } finally {
    safeDisconnect(client);
  }
}

// Teste la connexion et liste la racine du partage
async function testConnection(cfg) {
  const entries = await withClient(cfg, TIMEOUTS.test, (c) => readdir(c, ''));
  return { count: entries.length };
}

async function listFiles(cfg, dir) {
  const entries = await withClient(cfg, TIMEOUTS.list, (c) => readdir(c, dir));
  return entries
    .filter((e) => e && !e.isDirectory())
    .map((e) => ({
      name: e.name,
      size: Number(e.size) || 0,
      mtime: e.mtime instanceof Date ? e.mtime.toISOString() : e.mtime || null
    }));
}

async function readRemote(cfg, dir, name) {
  return withClient(
    cfg,
    TIMEOUTS.read,
    (c) =>
      new Promise((resolve, reject) => {
        c.readFile(joinRemote(dir, name), (err, data) => (err ? reject(err) : resolve(data)));
      })
  );
}

async function writeRemote(cfg, dir, name, buffer) {
  return withClient(
    cfg,
    TIMEOUTS.write,
    (c) =>
      new Promise((resolve, reject) => {
        const write = () =>
          c.writeFile(joinRemote(dir, name), buffer, { flags: 'w' }, (err) =>
            err ? reject(err) : resolve(true)
          );
        const d = cleanDir(dir);
        if (!d) return write();
        // mkdir peut échouer si le dossier existe déjà : on écrit dans tous les cas
        c.mkdir(d, () => write());
      })
  );
}

async function deleteRemote(cfg, dir, name) {
  return withClient(
    cfg,
    TIMEOUTS.list,
    (c) =>
      new Promise((resolve, reject) => {
        c.unlink(joinRemote(dir, name), (err) => (err ? reject(err) : resolve(true)));
      })
  );
}

module.exports = {
  TIMEOUTS,
  errMsg,
  normalizeShare,
  testConnection,
  listFiles,
  readRemote,
  writeRemote,
  deleteRemote
};
