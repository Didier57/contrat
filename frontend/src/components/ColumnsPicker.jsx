import React, { useState } from 'react';
import { FIELDS, DEFAULT_VISIBLE } from '../contractFields.js';

export default function ColumnsPicker({ onClose, onApply }) {
  const [selected, setSelected] = useState(() => {
    try {
      const saved = localStorage.getItem('contrats-visible-cols');
      return saved ? JSON.parse(saved) : DEFAULT_VISIBLE;
    } catch {
      return DEFAULT_VISIBLE;
    }
  });

  function toggle(key) {
    setSelected((s) => (s.includes(key) ? s.filter((k) => k !== key) : [...s, key]));
  }

  function apply() {
    localStorage.setItem('contrats-visible-cols', JSON.stringify(selected));
    onApply(selected);
    onClose();
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Choisir des colonnes</h3>
          <button className="close-btn" onClick={onClose}>&times;</button>
        </div>
        <div className="col-picker-body">
          {FIELDS.map((f) => (
            <label key={f.key} className="col-picker-item">
              <input type="checkbox" checked={selected.includes(f.key)} onChange={() => toggle(f.key)} />
              <span>{f.label}</span>
            </label>
          ))}
        </div>
        <div className="modal-footer">
          <button type="button" className="btn btn-ghost" onClick={() => setSelected(DEFAULT_VISIBLE)}>
            Réinitialiser
          </button>
          <button type="button" className="btn btn-primary" onClick={apply}>
            Appliquer ({selected.length})
          </button>
        </div>
      </div>
    </div>
  );
}