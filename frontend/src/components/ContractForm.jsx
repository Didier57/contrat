import React, { useState } from 'react';
import { api } from '../api.js';
import { FIELDS } from '../contractFields.js';

const FULL_WIDTH = ['customer_name', 'special_conditions', 'remarks_bac', 'remarks_bac_2'];

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

  function update(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
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
              const blank = form[f.key] === '' || form[f.key] == null || form[f.key] === 0;
              return (
                <div className={`field ${FULL_WIDTH.includes(f.key) ? 'full' : ''}`} key={f.key}>
                  <label>{f.label}{f.key === 'customer_name' ? ' *' : ''}</label>
                  {f.bool ? (
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
    </div>
  );
}