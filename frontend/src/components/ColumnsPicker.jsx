import React, { useMemo, useRef, useState } from 'react';
import { GripVertical, Pin } from 'lucide-react';
import { FIELDS, DEFAULT_VISIBLE } from '../contractFields.js';

// Customer Name est ancrée en tête de table : elle n'est pas réordonnable ici.
const PINNED = 'customer_name';

// Ordre par défaut : colonnes visibles d'abord (dans leur ordre), puis les autres.
function defaultOrder(selected) {
  const all = FIELDS.map((f) => f.key).filter((k) => k !== PINNED);
  const first = (selected || []).filter((k) => all.includes(k));
  return [...new Set([...first, ...all])];
}

function initSelection(current) {
  const base = Array.isArray(current) && current.length ? current : DEFAULT_VISIBLE;
  const sel = [...new Set(base)].filter((k) => k !== PINNED);
  return sel.length ? sel : DEFAULT_VISIBLE.filter((k) => k !== PINNED);
}

export default function ColumnsPicker({ current, onClose, onApply }) {
  const [selected, setSelected] = useState(() => initSelection(current));
  const [order, setOrder] = useState(() => defaultOrder(initSelection(current)));
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
    setSelected(initSelection(DEFAULT_VISIBLE));
    setOrder(defaultOrder(DEFAULT_VISIBLE));
  }

  function apply() {
    const next = [PINNED, ...order.filter((k) => selected.includes(k))];
    onApply(next);
    onClose();
  }

  const count = selected.length + 1;

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
          <div className="col-picker-row col-picker-row-locked" title="Colonne ancrée — toujours visible">
            <Pin size={13} className="col-picker-grip" />
            <label>
              <input type="checkbox" checked disabled />
              <span>{byKey[PINNED].label}</span>
            </label>
          </div>
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
            Appliquer ({count})
          </button>
        </div>
      </div>
    </div>
  );
}
