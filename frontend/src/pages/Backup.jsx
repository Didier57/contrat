import React, { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import { DatabaseBackup, Download, Mail, Upload, FileSpreadsheet, FileCode, ShieldAlert, HardDrive, Save, PlugZap, Play, RefreshCw, RotateCcw, Trash2, CalendarClock } from 'lucide-react';

const DAYS = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
const EMPTY_SMB = {
  host: '', share: '', domain: '', user: '', dir: '',
  enabled: false, auto_enabled: false, day: 1, hour: 3, keep: 7, last: '',
};

export default function Backup() {
  const fileRef = useRef(null);
  const sqlFileRef = useRef(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [confirmFile, setConfirmFile] = useState(null);
  const [importing, setImporting] = useState(false);
  const [confirmSqlFile, setConfirmSqlFile] = useState(null);
  const [importingSql, setImportingSql] = useState(false);

  const [smb, setSmb] = useState(EMPTY_SMB);
  const [smbPass, setSmbPass] = useState('');
  const [smbPassSet, setSmbPassSet] = useState(false);
  const [smbBusy, setSmbBusy] = useState('');
  const [smbMsg, setSmbMsg] = useState('');
  const [smbFiles, setSmbFiles] = useState([]);
  const [confirmSmbRestore, setConfirmSmbRestore] = useState(null);
  const [confirmSmbDelete, setConfirmSmbDelete] = useState(null);

  function showToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(''), 4500);
  }

  useEffect(() => {
    (async () => {
      try {
        const c = await api.get('/backup/smb');
        setSmb({
          host: c.host || '', share: c.share || '', domain: c.domain || '', user: c.user || '', dir: c.dir || '',
          enabled: !!c.enabled, auto_enabled: !!c.auto_enabled,
          day: Number.isInteger(c.day) ? c.day : 1, hour: Number.isInteger(c.hour) ? c.hour : 3,
          keep: Number.isInteger(c.keep) ? c.keep : 7, last: c.last || '',
        });
        setSmbPassSet(!!c.passSet);
      } catch (e) {
        setError(e.message);
      }
    })();
  }, []);

  function setSmbField(key, value) {
    setSmb((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSaveSmb() {
    setSmbBusy('save');
    setError('');
    setSmbMsg('');
    try {
      await api.put('/backup/smb', {
        host: smb.host, share: smb.share, domain: smb.domain, user: smb.user, dir: smb.dir,
        pass: smbPass, enabled: smb.enabled, auto_enabled: smb.auto_enabled,
        day: smb.day, hour: smb.hour, keep: smb.keep,
      });
      if (smbPass) { setSmbPassSet(true); setSmbPass(''); }
      showToast('Configuration SMB enregistrée');
    } catch (e) {
      setError(e.message);
    } finally {
      setSmbBusy('');
    }
  }

  async function handleTestSmb() {
    setSmbBusy('test');
    setError('');
    setSmbMsg('');
    try {
      const r = await api.post('/backup/smb/test');
      setSmbMsg(r.message || 'Connexion réussie');
    } catch (e) {
      setError(e.message);
    } finally {
      setSmbBusy('');
    }
  }

  async function handleRunSmb() {
    setSmbBusy('run');
    setError('');
    setSmbMsg('');
    try {
      const r = await api.post('/backup/smb/run');
      showToast(r.message || 'Sauvegarde effectuée');
      loadSmbFiles();
    } catch (e) {
      setError(e.message);
    } finally {
      setSmbBusy('');
    }
  }

  async function loadSmbFiles() {
    setSmbBusy('files');
    setError('');
    try {
      const r = await api.get('/backup/smb/files');
      setSmbFiles(r.files || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setSmbBusy('');
    }
  }

  async function handleRestoreSmb() {
    if (!confirmSmbRestore) return;
    setSmbBusy('restore');
    setError('');
    try {
      const r = await api.post('/backup/smb/restore', { name: confirmSmbRestore });
      showToast(r.message || 'Base restaurée');
    } catch (e) {
      setError(e.message);
    } finally {
      setSmbBusy('');
      setConfirmSmbRestore(null);
    }
  }

  async function handleDeleteSmb() {
    if (!confirmSmbDelete) return;
    setSmbBusy('delete');
    setError('');
    try {
      const r = await api.post('/backup/smb/delete', { name: confirmSmbDelete });
      showToast(r.message || 'Fichier supprimé');
      setSmbFiles((prev) => prev.filter((f) => f.name !== confirmSmbDelete));
    } catch (e) {
      setError(e.message);
    } finally {
      setSmbBusy('');
      setConfirmSmbDelete(null);
    }
  }

  function fmtSize(n) {
    if (n == null) return '—';
    if (n < 1024) return `${n} o`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} Ko`;
    return `${(n / 1024 / 1024).toFixed(1)} Mo`;
  }

  async function handleExport() {
    setBusy('export');
    setError('');
    try {
      await api.download('/backup/export');
      showToast('Export Excel de la base généré');
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy('');
    }
  }

  async function handleSend() {
    setBusy('send');
    setError('');
    try {
      const r = await api.post('/backup/send');
      showToast(r.message);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy('');
    }
  }

  function onFileChosen(e) {
    const f = e.target.files && e.target.files[0];
    if (f) setConfirmFile(f);
    e.target.value = '';
  }

  async function handleImport() {
    if (!confirmFile) return;
    setImporting(true);
    setError('');
    try {
      const r = await api.upload('/backup/import', confirmFile);
      showToast(r.message);
    } catch (e) {
      setError(e.message);
    } finally {
      setImporting(false);
      setConfirmFile(null);
    }
  }

  async function handleExportSql() {
    setBusy('export-sql');
    setError('');
    try {
      await api.download('/backup/sql');
      showToast('Sauvegarde SQL de la base générée');
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy('');
    }
  }

  function onSqlFileChosen(e) {
    const f = e.target.files && e.target.files[0];
    if (f) setConfirmSqlFile(f);
    e.target.value = '';
  }

  async function handleImportSql() {
    if (!confirmSqlFile) return;
    setImportingSql(true);
    setError('');
    try {
      const r = await api.upload('/backup/sql/restore', confirmSqlFile);
      showToast(r.message);
    } catch (e) {
      setError(e.message);
    } finally {
      setImportingSql(false);
      setConfirmSqlFile(null);
    }
  }

  return (
    <div className="settings-page">
      <div className="page-header">
        <div>
          <h2>Sauvegarde</h2>
          <div className="sub">Exporter, restaurer ou envoyer la base de données au format Excel ou SQL</div>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}
      {toast && <div className="toast">{toast}</div>}

      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="panel-title">
          <DatabaseBackup size={16} /> Base de données complète
        </div>
        <p style={{ margin: '0 0 14px', color: 'var(--text-secondary)', fontSize: 13 }}>
          Le fichier Excel contient un onglet par table (Contrats, Notes Remarks, Utilisateurs,
          Paramètres, Journal d'activité). La restauration réimporte l'intégralité de ces onglets,
          notes Remarks Bac comprises.
        </p>
        <div className="backup-actions">
          <button className="btn btn-primary" onClick={handleExport} disabled={!!busy}>
            <DatabaseBackup size={16} />&nbsp;{busy === 'export' ? <span className="spinner" /> : <Download size={15} />}&nbsp;<span>Exporter vers Excel</span>
          </button>
          <button className="btn btn-ghost" onClick={handleSend} disabled={!!busy}>
            <Mail size={15} />
            {busy === 'send' && <span className="spinner" />}
            Envoyer la base par email
          </button>
          <button className="btn btn-ghost" onClick={() => fileRef.current.click()} disabled={!!busy}>
            <Upload size={15} /> Importer un fichier Excel…
          </button>
          <input ref={fileRef} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" style={{ display: 'none' }} onChange={onFileChosen} />
        </div>
      </div>

      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="panel-title">
          <FileCode size={16} /> Base de données (fichier SQL)
        </div>
        <p style={{ margin: '0 0 14px', color: 'var(--text-secondary)', fontSize: 13 }}>
          Sauvegarde complète de la base au format SQL : structure et données de toutes les tables.
          Le fichier peut être restauré ici même ou rejoué avec l'outil en ligne de commande <code>sqlite3</code>.
        </p>
        <div className="backup-actions">
          <button className="btn btn-primary" onClick={handleExportSql} disabled={!!busy}>
            <Download size={15} />
            {busy === 'export-sql' && <span className="spinner" />}
            Exporter en SQL
          </button>
          <button className="btn btn-ghost" onClick={() => sqlFileRef.current.click()} disabled={!!busy}>
            <Upload size={15} /> Importer un fichier SQL…
          </button>
          <input ref={sqlFileRef} type="file" accept=".sql,text/plain" style={{ display: 'none' }} onChange={onSqlFileChosen} />
        </div>
      </div>

      <div className="panel">
        <div className="panel-title">
          <FileSpreadsheet size={16} /> Restaurer après incident
        </div>
        <p style={{ margin: '0 0 14px', color: 'var(--text-secondary)', fontSize: 13 }}>
          L'import remplace tout le contenu actuel de la base par celui du fichier Excel choisi
          (un administrateur restera toujours présent en cas d'absence dans le fichier).
        </p>
        <div className="backup-warn">
          <ShieldAlert size={16} />
          <span>Cette action est irréversible : faites d'abord un export si la base actuelle est encore utilisable.</span>
        </div>
      </div>

      <div className="panel" style={{ marginBottom: 16, marginTop: 16 }}>
        <div className="panel-title">
          <HardDrive size={16} /> Serveur SMB (sauvegarde réseau)
        </div>
        <p style={{ margin: '0 0 14px', color: 'var(--text-secondary)', fontSize: 13 }}>
          Enregistrez les fichiers de sauvegarde SQL sur un partage réseau SMB. Renseignez l'hôte
          (nom ou IP), le nom du partage, puis testez la connexion.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
          <div className="field">
            <label>Hôte / IP</label>
            <input value={smb.host} onChange={(e) => setSmbField('host', e.target.value)} placeholder="192.168.1.10" />
          </div>
          <div className="field">
            <label>Partage</label>
            <input value={smb.share} onChange={(e) => setSmbField('share', e.target.value)} placeholder="backups" />
          </div>
          <div className="field">
            <label>Dossier (optionnel)</label>
            <input value={smb.dir} onChange={(e) => setSmbField('dir', e.target.value)} placeholder="contrat" />
          </div>
          <div className="field">
            <label>Domaine (optionnel)</label>
            <input value={smb.domain} onChange={(e) => setSmbField('domain', e.target.value)} />
          </div>
          <div className="field">
            <label>Utilisateur</label>
            <input value={smb.user} onChange={(e) => setSmbField('user', e.target.value)} autoComplete="off" />
          </div>
          <div className="field">
            <label>Mot de passe</label>
            <input
              type="password"
              value={smbPass}
              onChange={(e) => setSmbPass(e.target.value)}
              autoComplete="new-password"
              placeholder={smbPassSet ? '•••••• (laisser vide pour conserver)' : ''}
            />
          </div>
        </div>
        <div className="field field-check" style={{ marginTop: 12 }}>
          <input id="smb-enabled" type="checkbox" checked={smb.enabled} onChange={(e) => setSmbField('enabled', e.target.checked)} />
          <label htmlFor="smb-enabled">Stockage SMB activé</label>
        </div>
        <div className="backup-actions" style={{ marginTop: 12 }}>
          <button className="btn btn-primary" onClick={handleSaveSmb} disabled={!!smbBusy}>
            <Save size={15} />{smbBusy === 'save' && <span className="spinner" />} Enregistrer
          </button>
          <button className="btn btn-ghost" onClick={handleTestSmb} disabled={!!smbBusy}>
            <PlugZap size={15} />{smbBusy === 'test' && <span className="spinner" />} Tester la connexion
          </button>
          <button className="btn btn-ghost" onClick={handleRunSmb} disabled={!!smbBusy}>
            <Play size={15} />{smbBusy === 'run' && <span className="spinner" />} Sauvegarder maintenant
          </button>
        </div>
        {smbBusy === 'test' && <p style={{ margin: '10px 0 0', color: 'var(--text-secondary)', fontSize: 13 }}>Connexion au serveur SMB en cours…</p>}
        {smbBusy === 'run' && <p style={{ margin: '10px 0 0', color: 'var(--text-secondary)', fontSize: 13 }}>Sauvegarde SQL en cours…</p>}
        {smbMsg && <div className="result-box ok" style={{ marginTop: 12 }}>{smbMsg}</div>}
      </div>

      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="panel-title">
          <CalendarClock size={16} /> Sauvegarde automatique
        </div>
        <p style={{ margin: '0 0 14px', color: 'var(--text-secondary)', fontSize: 13 }}>
          Planifiez l'envoi automatique d'une sauvegarde SQL vers le serveur SMB. L'ancienne
          sauvegarde du jour est remplacée une seule fois par jour.
        </p>
        <div className="field field-check">
          <input id="smb-auto" type="checkbox" checked={smb.auto_enabled} onChange={(e) => setSmbField('auto_enabled', e.target.checked)} />
          <label htmlFor="smb-auto">Activer la sauvegarde automatique</label>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginTop: 12 }}>
          <div className="field">
            <label>Jour de la semaine</label>
            <select value={smb.day} onChange={(e) => setSmbField('day', Number(e.target.value))}>
              {DAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Heure (0-23)</label>
            <input type="number" min="0" max="23" value={smb.hour} onChange={(e) => setSmbField('hour', Number(e.target.value))} />
          </div>
          <div className="field">
            <label>Nombre à conserver</label>
            <input type="number" min="1" max="365" value={smb.keep} onChange={(e) => setSmbField('keep', Number(e.target.value))} />
          </div>
        </div>
        <p style={{ margin: '10px 0 0', color: 'var(--text-secondary)', fontSize: 12 }}>
          {smb.last ? `Dernière sauvegarde : ${smb.last.slice(0, 16).replace('T', ' ')}` : 'Aucune sauvegarde effectuée pour le moment.'}
        </p>
        <div className="backup-actions" style={{ marginTop: 12 }}>
          <button className="btn btn-primary" onClick={handleSaveSmb} disabled={!!smbBusy}>
            <Save size={15} />{smbBusy === 'save' && <span className="spinner" />} Enregistrer
          </button>
        </div>
      </div>

      <div className="panel">
        <div className="panel-title">
          <HardDrive size={16} /> Fichiers de sauvegarde sur le serveur SMB
        </div>
        <div className="backup-actions" style={{ marginBottom: 12 }}>
          <button className="btn btn-ghost" onClick={loadSmbFiles} disabled={!!smbBusy}>
            <RefreshCw size={15} />{smbBusy === 'files' && <span className="spinner" />} Actualiser la liste
          </button>
        </div>
        {smbFiles.length === 0 ? (
          <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: 13 }}>
            Aucun fichier de sauvegarde listé. Cliquez sur « Actualiser la liste ».
          </p>
        ) : (
          <table className="table table-compact">
            <thead>
              <tr>
                <th>Fichier</th>
                <th style={{ width: 100 }}>Taille</th>
                <th style={{ width: 180 }}>Modifié le</th>
                <th style={{ width: 130 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {smbFiles.map((f) => (
                <tr key={f.name}>
                  <td>{f.name}</td>
                  <td className="nowrap">{fmtSize(f.size)}</td>
                  <td className="nowrap">{f.mtime ? String(f.mtime).slice(0, 16).replace('T', ' ') : '—'}</td>
                  <td className="nowrap">
                    <button className="btn btn-xs btn-ghost" onClick={() => setConfirmSmbRestore(f.name)} disabled={!!smbBusy} title="Restaurer cette sauvegarde"><RotateCcw size={13} /></button>
                    <button className="btn btn-xs btn-danger" onClick={() => setConfirmSmbDelete(f.name)} disabled={!!smbBusy} title="Supprimer ce fichier"><Trash2 size={13} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {confirmSmbRestore && (
        <ConfirmDialog
          title="Restaurer la base depuis le serveur SMB ?"
          message={`Le fichier « ${confirmSmbRestore} » va remplacer l'intégralité de la base de données (toutes les tables). Confirmez-vous la restauration ?`}
          confirmLabel="Restaurer"
          loading={smbBusy === 'restore'}
          onCancel={() => setConfirmSmbRestore(null)}
          onConfirm={handleRestoreSmb}
        />
      )}

      {confirmSmbDelete && (
        <ConfirmDialog
          title="Supprimer cette sauvegarde ?"
          message={`Le fichier « ${confirmSmbDelete} » sera définitivement supprimé du serveur SMB.`}
          confirmLabel="Supprimer"
          loading={smbBusy === 'delete'}
          onCancel={() => setConfirmSmbDelete(null)}
          onConfirm={handleDeleteSmb}
        />
      )}

      {confirmFile && (
        <ConfirmDialog
          title="Restaurer la base depuis un fichier Excel ?"
          message={`Le fichier « ${confirmFile.name} » va remplacer l'intégralité des données actuelles. Confirmez-vous l'import ?`}
          confirmLabel="Importer"
          loading={importing}
          onCancel={() => setConfirmFile(null)}
          onConfirm={handleImport}
        />
      )}

      {confirmSqlFile && (
        <ConfirmDialog
          title="Restaurer la base depuis un fichier SQL ?"
          message={`Le fichier « ${confirmSqlFile.name} » va remplacer l'intégralité de la base de données (toutes les tables). Confirmez-vous la restauration ?`}
          confirmLabel="Restaurer"
          loading={importingSql}
          onCancel={() => setConfirmSqlFile(null)}
          onConfirm={handleImportSql}
        />
      )}
    </div>
  );
}