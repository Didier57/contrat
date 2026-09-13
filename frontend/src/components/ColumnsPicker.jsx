import React, { useMemo, useRef, useState } from 'react';
import { GripVertical } from 'lucide-react';
import { FIELDS, DEFAULT_VISIBLE } from '../contractFields.js';

// Ordre par défaut : colonnes visibles d'abord (dans leur ordre), puis les autres.
function defaultOrder(selected) {
  const all = FIELDS.map((f) => f.key);
  const first = (selected || []).filter((k) => all.includes(k));
  return [...new Set([...first, ...all])];
}

export default function ColumnsPicker({ current, onClose, onApply }) {
  const initialSelection = Array.isArray(current) && current.length ? current : DEFAULT_VISIBLE;
  const [selected, setSelected] = useState(() => [...new Set(initialSelection)]);
  const [order, setOrder] = useState(() => defaultOrder(initialSelection));
  const dragIndex = useRef(null);

  const byKey = useMemo(() => Object.fromEntries(FIELDS.map((f) => [f.key, f])), []);

  function toggle(key) {
    setSelected((s) => (s.includes(key) ? s.filter((k) => k !== key) : [...s, key]));
  }

  function onDragStart(i) {
    dragIndex.current = i;
  }

  function onDragEnter(i) {
    if (dragIndex.current === null || dragIndex.current === i) return;
    setOrder((prev) => {
      const next = [...prev];
      const [moved] = next.splice(dragIndex.current, 1);
      next.splice(i, 0, moved);
      dragIndex.current = i;
      return next;
    });
  }

  function onDragEnd() {
    dragIndex.current = null;
  }

  function reset() {
    setSelected([...DEFAULT_VISIBLE]);
    setOrder(defaultOrder(DEFAULT_VISIBLE));
  }

  function apply() {
    const next = order.filter((k) => selected.includes(k));
    onApply(next);
    onClose();
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Choisir des colonnes</h3>
          <button className="close-btn" onClick={onClose}>&times;</button>
        </div>
        <div className="col-picker-hint">
          Glissez-déposez les lignes pour changer l'ordre d'affichage. Cochez pour afficher/masquer.
          Vos préférences sont enregistrées sur votre compte.
        </div>
        <div className="col-picker-body">
          {order.map((key, i) => {
            const f = byKey[key];
            if (!f) return null;
            const isSel = selected.includes(key);
            return (
              <div
                key={key}
                className={`col-picker-row${isSel ? '' : ' unselected'}`}
                draggable
                onDragStart={() => onDragStart(i)}
                onDragEnter={() => onDragEnter(i)}
                onDragOver={(e) => e.preventDefault()}
                onDragEnd={onDragEnd}
              >
                <GripVertical size={14} className="col-picker-grip" />
                <label>
                  <input type="checkbox" checked={isSel} onChange={() => toggle(key)} />
                  <span>{f.label}</span>
                </label>
              </div>
            );
          })}
        </div>
        <div className="modal-footer">
          <button type="button" className="btn btn-ghost" onClick={reset}>
            Réinitialiser
          </button>
          <button type="button" className="btn btn-primary" onClick={apply} disabled={selected.length === 0}>
            Appliquer ({selected.length})
          </button>
        </div>
      </div>
    </div>
  );
}
