import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import { FIELDS } from '../contractFields.js';
import { Pencil, Trash2, Plus } from 'lucide-react';

const FULL_WIDTH = ['customer_name', 'special_conditions', 'remarks_bac', 'remarks_bac_2'];

function formatDateTime(dt) {
  if (!dt) return '';
  const d = new Date(dt);
  if (isNaN(d.getTime())) return String(dt);
  const date = d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' });
  const time = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  return `${date} ${time}`;
}

export default function ContractForm({ contract, onClose, onSaved }) {
  const isEdit = !!contract.id;
  const [form, setForm] = useState(() => {
    const init = {};
    for (const f of FIELDS) {
      let v = contract[f.key] ?? '';
      if (f.bool) v = Number(v) === 1;
      else if (f.type === 'date' && v && typeof v === 'string' && v.includes('-')) v = v.slice(0, 10);
      init[f.key] = v;
    }
    return init;
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notes, setNotes] = useState([]);
  const [notesLoading, setNotesLoading] = useState(false);
  const [noteDialog, setNoteDialog] = useState(null);

  useEffect(() => {
    if (!isEdit) return;
    setNotesLoading(true);
    api.get(`/contracts/${contract.id}/remarks`)
      .then(setNotes)
      .catch(() => setNotes([]))
      .finally(() => setNotesLoading(false));
  }, [isEdit, contract.id]);

  function update(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function refreshNotes() {
    try {
      setNotes(await api.get(`/contracts/${contract.id}/remarks`));
    } catch {
      /* ignore */
    }
  }

  async function saveNote() {
    const dialog = noteDialog;
    const text = String(dialog.text || '').trim();
    if (!text) {
      setError('La note ne peut pas être vide.');
      return;
    }
    try {
      if (dialog.mode === 'edit') {
        await api.put(`/contracts/${contract.id}/remarks/${dialog.note.id}`, { text });
      } else {
        await api.post(`/contracts/${contract.id}/remarks`, { text });
      }
      setNoteDialog(null);
      setError('');
      refreshNotes();
    } catch (err) {
      setError(err.message);
    }
  }

  async function editNote(note) {
    setNoteDialog({ mode: 'edit', note, text: note.text });
  }

  async function deleteNote(note) {
    if (!window.confirm('Supprimer cette note ?')) return;
    try {
      await api.del(`/contracts/${contract.id}/remarks/${note.id}`);
      refreshNotes();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!String(form.customer_name || '').trim()) {
      setError('Le champ Customer Name est obligatoire.');
      return;
    }
    setSaving(true);
    const body = {};
    for (const f of FIELDS) {
      if (isEdit && f.key === 'remarks_bac') continue; // gérées via les notes
      let v = form[f.key];
      if (f.bool) {
        body[f.key] = v ? 1 : 0;
      } else if (v === '' || v == null) {
        body[f.key] = null;
      } else if (f.type === 'int' || f.type === 'real') {
        body[f.key] = Number(v);
      } else if (f.type === 'date' && v) {
        body[f.key] = typeof v === 'string' && v.includes('-') && v.length >= 10 ? v.slice(0, 10) : v;
      } else {
        body[f.key] = v;
      }
    }
    try {
      if (isEdit) {
        await api.put(`/contracts/${contract.id}`, body);
      } else {
        await api.post('/contracts', body);
      }
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-lg" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{isEdit ? 'Modifier le contrat' : 'Ajouter un contrat'}</h3>
          <button className="close-btn" onClick={onClose}>&times;</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {error && <div className="error-banner full">{error}</div>}
            {FIELDS.map((f) => {
              if (f.key === 'remarks_bac') {
                if (!isEdit) {
                  return (
                    <div className="field full" key={f.key}>
                      <label>{f.label}</label>
                      <textarea
                        rows={3}
                        value={form[f.key] ?? ''}
                        onChange={(e) => update(f.key, e.target.value)}
                        placeholder="Remarque initiale…"
                      />
                    </div>
                  );
                }
                return (
                  <div className="field full" key={f.key}>
                    <div className="remarks-head">
                      <label>{f.label} <span className="muted">(dernier commentaire affiché dans la table)</span></label>
                      <button
                        type="button"
                        className="btn btn-xs btn-ghost"
                        onClick={() => setNoteDialog({ mode: 'add', text: '' })}
                        title="Ajouter une note"
                      ><Plus size={13} /> Ajouter une note</button>
                    </div>
                    {notesLoading ? (
                      <div className="empty-state"><span className="spinner" /></div>
                    ) : notes.length === 0 ? (
                      <div className="empty-state">Aucune note.</div>
                    ) : (
                      <table className="table table-compact remarks-table">
                        <thead>
                          <tr>
                            <th>Note</th>
                            <th className="remarks-date">Date d'ajout</th>
                            <th className="remarks-actions">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {notes.map((n) => (
                            <tr key={n.id}>
                              <td className="remarks-text" title={n.text}>{n.text}</td>
                              <td className="remarks-date">{formatDateTime(n.created_at)}</td>
                              <td className="remarks-actions">
                                <button
                                  type="button"
                                  className="btn btn-xs btn-ghost"
                                  title="Modifier la note"
                                  onClick={() => editNote(n)}
                                ><Pencil size={12} /></button>
                                <button
                                  type="button"
                                  className="btn btn-xs btn-danger"
                                  title="Supprimer la note"
                                  onClick={() => deleteNote(n)}
                                ><Trash2 size={12} /></button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                );
              }
              const blank = form[f.key] === '' || form[f.key] == null || form[f.key] === 0;
              return (
                <div className={`field ${FULL_WIDTH.includes(f.key) ? 'full' : ''}`} key={f.key}>
                  <label>{f.label}{f.key === 'customer_name' ? ' *' : ''}</label>
                  {f.key === 'import_id' ? (
                    <input
                      type="text"
                      className="input-readonly"
                      value={form[f.key] ?? ''}
                      readOnly
                      title="Identifiant attribué automatiquement — non modifiable"
                    />
                  ) : f.bool ? (
                    <div className="check-field">
                      <input
                        type="checkbox"
                        checked={!!form[f.key]}
                        onChange={(e) => update(f.key, e.target.checked)}
                      />
                      <span>Oui</span>
                    </div>
                  ) : (f.type === 'real' || f.type === 'int') && !blank ? (
                    <div className="set-value">
                      <input
                        type="number"
                        step={f.type === 'real' ? '0.01' : '1'}
                        value={form[f.key]}
                        onChange={(e) => update(f.key, e.target.value)}
                      />
                      <button
                        type="button"
                        className="btn btn-xs btn-ghost"
                        title="Effacer la valeur"
                        onClick={() => update(f.key, '')}
                      >✕</button>
                    </div>
                  ) : (
                    <input
                      type={f.type === 'date' ? 'date' : f.type === 'real' || f.type === 'int' ? 'number' : 'text'}
                      step={f.type === 'real' ? '0.01' : f.type === 'int' ? '1' : undefined}
                      value={form[f.key] ?? ''}
                      onChange={(e) => update(f.key, e.target.value)}
                    />
                  )}
                </div>
              );
            })}
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Annuler</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? <span className="spinner" /> : 'Enregistrer'}
            </button>
          </div>
        </form>
      </div>

      {noteDialog && (
        <div
          className="modal-overlay note-dialog-overlay"
          onClick={(e) => { e.stopPropagation(); setNoteDialog(null); }}
        >
          <div className="modal modal-sm" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{noteDialog.mode === 'edit' ? 'Modifier la note' : 'Ajouter une note'}</h3>
              <button className="close-btn" type="button" onClick={() => setNoteDialog(null)}>&times;</button>
            </div>
            <div className="note-dialog-body">
              <textarea
                autoFocus
                rows={6}
                value={noteDialog.text}
                onChange={(e) => setNoteDialog((d) => ({ ...d, text: e.target.value }))}
                placeholder="Saisissez la note…"
              />
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-ghost" onClick={() => setNoteDialog(null)}>Annuler</button>
              <button type="button" className="btn btn-primary" onClick={saveNote}>Enregistrer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}