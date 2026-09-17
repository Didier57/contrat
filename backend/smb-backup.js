const { getSetting, setSetting, getBool, getInt } = require('./settings');
const { sqlDump, restoreSql } = require('./backup');
const smb = require('./smb');
const { logAudit } = require('./audit');

const BACKUP_RE = /^contrats_db_.*\.sql$/;

function getSmbConfig() {
  return {
    host: String(getSetting('smb.host', '') || ''),
    share: String(getSetting('smb.share', '') || ''),
    domain: String(getSetting('smb.domain', '') || ''),
    user: String(getSetting('smb.user', '') || ''),
    pass: String(getSetting('smb.pass', '') || ''),
    dir: String(getSetting('smb.dir', '') || ''),
    enabled: getBool('smb.enabled', false),
  };
}

function smbConfigured(cfg) {
  return !!(cfg && cfg.host && cfg.share);
}

function pad(n) {
  return String(n).padStart(2, '0');
}

function todayKey(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function stamp() {
  const d = new Date();
  return `${todayKey(d)}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

async function prune(cfg, keep) {
  if (!keep || keep <= 0) return [];
  const files = await smb.listFiles(cfg, cfg.dir);
  const backups = files
    .filter((f) => BACKUP_RE.test(f.name))
    .sort((a, b) => (a.name < b.name ? 1 : -1));
  const removed = [];
  for (const f of backups.slice(keep)) {
    try {
      await smb.deleteRemote(cfg, cfg.dir, f.name);
      removed.push(f.name);
    } catch (e) {
      console.error('[smb] suppression impossible :', f.name, e.message);
    }
  }
  return removed;
}

async function runBackup(reason) {
  const cfg = getSmbConfig();
  if (!smbConfigured(cfg)) throw new Error('SMB non configuré');
  const sql = sqlDump();
  const name = `contrats_db_${stamp()}.sql`;
  await smb.writeRemote(cfg, cfg.dir, name, Buffer.from(sql, 'utf8'));
  const keep = getInt('smb.keep', 7);
  const pruned = await prune(cfg, keep);
  setSetting('smb.last', new Date().toISOString());
  logAudit({ action: 'Sauvegarde SQL vers SMB', category: 'backup', target: name, detail: reason || '' });
  return { name, size: Buffer.byteLength(sql), pruned };
}

function dueSkipReason(now) {
  const cfg = getSmbConfig();
  if (!getBool('smb.auto_enabled', false)) return 'sauvegarde automatique désactivée';
  if (!smbConfigured(cfg)) return 'serveur SMB non configuré (hôte et partage requis)';
  const last = String(getSetting('smb.last', '') || '');
  if (last) {
    const d = new Date(last);
    if (!isNaN(d.getTime()) && todayKey(d) === todayKey(now)) return "déjà effectuée aujourd'hui";
  }
  const day = getInt('smb.day', 1);
  if (day !== 7 && now.getDay() !== day) return `jour non planifié (jour serveur : ${now.getDay()}, jour réglé : ${day})`;
  const hour = getInt('smb.hour', 3);
  if (now.getHours() < hour) return `heure non atteinte (heure serveur : ${now.getHours()}h, heure réglée : ${hour}h)`;
  return null;
}

async function runDueBackup() {
  const now = new Date();
  setSetting('smb.last_check', `${todayKey(now)} ${pad(now.getHours())}:${pad(now.getMinutes())}`);
  const reason = dueSkipReason(now);
  if (reason) {
    setSetting('smb.last_result', `Ignorée : ${reason}`);
    if (reason !== "déjà effectuée aujourd'hui") console.log('[smb] sauvegarde automatique ignorée :', reason);
    return { skipped: reason };
  }
  try {
    const result = await runBackup('planifiée');
    setSetting('smb.last_result', `Sauvegarde effectuée : ${result.name}`);
    return result;
  } catch (e) {
    setSetting('smb.last_result', `Échec : ${e.message}`);
    throw e;
  }
}

async function listBackups() {
  const cfg = getSmbConfig();
  const files = await smb.listFiles(cfg, cfg.dir);
  return files
    .filter((f) => /\.sql$/i.test(f.name))
    .sort((a, b) => (a.name < b.name ? 1 : -1));
}

async function restoreRemote(name) {
  const cfg = getSmbConfig();
  const buf = await smb.readRemote(cfg, cfg.dir, name);
  const result = restoreSql(buf);
  logAudit({ action: 'Restauration SQL depuis SMB', category: 'backup', target: name });
  return result;
}

async function deleteRemote(name) {
  const cfg = getSmbConfig();
  await smb.deleteRemote(cfg, cfg.dir, name);
  logAudit({ action: 'Suppression d\'une sauvegarde SMB', category: 'backup', target: name });
}

module.exports = {
  getSmbConfig,
  smbConfigured,
  dueSkipReason,
  runBackup,
  runDueBackup,
  listBackups,
  restoreRemote,
  deleteRemote,
};
