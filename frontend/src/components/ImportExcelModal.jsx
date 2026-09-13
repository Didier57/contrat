import React, { useRef, useState } from 'react';
import { api } from '../api.js';
import { UploadCloud, FileSpreadsheet, AlertTriangle, CheckCircle2, X } from 'lucide-react';

export default function ImportExcelModal({ onClose, onDone }) {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null); // { sheet, total, rows }
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef(null);

  async function inspect(f) {
    if (!f) return;
    setError('');
    setResult(null);
    setFile(null);
    setPreview(null);
    setParsing(true);
    const fileObj = f;
    try {
      const XLSX = await import('exceljs');
      const buf = await fileObj.arrayBuffer();
      const wb = new XLSX.Workbook();
      await wb.xlsx.load(buf);
      const ws = wb.worksheets[0];
      if (!ws) throw new Error('Ce fichier ne contient aucune feuille.');
      const values = [];
      ws.eachRow({ includeEmpty: false }, (row) => {
        const vals = row.values.slice(1);
        while (vals.length && (vals[vals.length - 1] === null || vals[vals.length - 1] === undefined)) vals.pop();
        if (vals.some((v) => v !== null && v !== undefined && String(v).trim() !== '')) values.push(vals);
      });
      const hasHeader = values.length > 1;
      const dataRows = hasHeader ? values.slice(1) : values;
      const cols = hasHeader ? values[0].map((h) => String(h == null ? '' : h).trim()) : [];
      setFile(fileObj);
      setPreview({
        sheet: ws.name,
        total: dataRows.length,
        cols,
        rows: dataRows.slice(0, 5).map((r) => cols.map((c, i) => (r[i] ?? '')))
      });
    } catch (e) {
      setError('Impossible de lire ce fichier : ' + e.message);
    } finally {
      setParsing(false);
    }
  }

  function onFilePicked(e) {
    const f = e.target.files && e.target.files[0];
    if (f) inspect(f);
  }

  function onDrop(e) {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) inspect(f);
  }

  async function doImport() {
    if (!file) return;
    setImporting(true);
    setError('');
    try {
      const res = await api.upload('/contracts/import', file);
      setResult(res);
    } catch (e) {
      setError(e.message);
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-lg" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3><UploadCloud size={16} /> Importer un fichier Excel</h3>
          <button className="close-btn" onClick={onClose}>&times;</button>
        </div>

        {!result ? (
          <div className="modal-body">
            {error && <div className="error-banner full">{error}</div>}

            <div
              className={`dropzone${dragOver ? ' drag-over' : ''}${file ? ' has-file' : ''}`}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
              onClick={() => inputRef.current && inputRef.current.click()}
            >
              <input ref={inputRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={onFilePicked} />
              {parsing ? (
                <div className="dropzone-content"><span className="spinner" /> Lecture du fichier…</div>
              ) : file ? (
                <div className="dropzone-content">
                  <FileSpreadsheet size={28} />
                  <b>{file.name}</b>
                  {preview && (
                    <span className="dropzone-meta">
                      Feuille « {preview.sheet} » · {preview.total} ligne(s)
                    </span>
                  )}
                </div>
              ) : (
                <div className="dropzone-content">
                  <UploadCloud size={28} />
                  <b>Glissez ici votre fichier Excel (.xlsx)</b>
                  <span className="dropzone-meta">ou cliquez pour choisir un fichier</span>
                </div>
              )}
            </div>

            {preview && (
              <>
                <div className="import-warning">
                  <AlertTriangle size={15} />
                  <span>
                    L'import <b>remplace intégralement</b> la base de contrats actuelle
                    par le contenu de « {file.name} » (feuille « {preview.sheet} », {preview.total} ligne(s)).
                  </span>
                </div>

                <div className="import-preview">
                  <table className="table table-compact">
                    <thead>
                      <tr>
                        {preview.cols.slice(0, 10).map((c, i) => <th key={i}>{c}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {preview.rows.map((r, i) => (
                        <tr key={i}>
                          {r.slice(0, 10).map((v, j) => <td key={j}>{String(v ?? '')}</td>)}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="modal-body">
            <div className="result-box ok"><CheckCircle2 size={16} /> {result.message}</div>
            {result.errors && result.errors.slice(0, 10).map((err, i) => (
              <div key={i} className="result-err"><X size={13} /> {err}</div>
            ))}
          </div>
        )}

        <div className="modal-footer">
          {result ? (
            <>
              <span className="muted">{result.imported} contrat(s) en base.</span>
              <button className="btn btn-primary" onClick={onDone}>Fermer</button>
            </>
          ) : (
            <>
              <button type="button" className="btn btn-ghost" onClick={onClose}>Annuler</button>
              <button
                type="button"
                className="btn btn-danger"
                disabled={!file || importing || parsing}
                onClick={doImport}
              >
                {importing ? <span className="spinner" /> : 'Importer et remplacer'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}