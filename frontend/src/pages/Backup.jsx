import React, { useRef, useState } from 'react';
import { api } from '../api.js';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import { DatabaseBackup, Download, Mail, Upload, FileSpreadsheet, FileCode, ShieldAlert } from 'lucide-react';

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

  function showToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(''), 4500);
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