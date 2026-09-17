import React, { useMemo, useRef, useState } from 'react';
import { GripVertical, Pin } from 'lucide-react';
import { FIELDS, DEFAULT_VISIBLE } from '../contractFields.js';
import { fieldWidth, useAppearance } from '../appearance.js';

// Customer Name est ancrée en tête de table : elle n'est pas réordonnable ici.
const PINNED = 'customer_name';

// Ordre par défaut : colonnes visibles d'abord (dans leur ordre), puis les autres.
function defaultOrder(selected, isHidden = () => false) {
  const all = FIELDS.map((f) => f.key).filter((k) => k !== PINNED && !isHidden(k));
  const first = (selected || []).filter((k) => all.includes(k));
  return [...new Set([...first, ...all])];
}

function initSelection(current, isHidden = () => false) {
  const base = Array.isArray(current) && current.length ? current : DEFAULT_VISIBLE;
  const sel = [...new Set(base)].filter((k) => k !== PINNED && !isHidden(k));
  const fallback = DEFAULT_VISIBLE.filter((k) => k !== PINNED && !isHidden(k));
  return sel.length ? sel : fallback;
}

export default function ColumnsPicker({ current, onClose, onApply, labels }) {
  const { appearance } = useAppearance();
  const isHidden = (key) => fieldWidth(appearance, key) === 'hidden';
  const [selected, setSelected] = useState(() => initSelection(current, isHidden));
  const [order, setOrder] = useState(() => defaultOrder(initSelection(current, isHidden), isHidden));
  const dragIndex = useRef(null);

  const byKey = useMemo(
    () => Object.fromEntries(FIELDS.map((f) => [f.key, { ...f, label: (labels && labels[f.key]) || f.label }])),
    [labels]
  );

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
    setSelected(initSelection(DEFAULT_VISIBLE, isHidden));
    setOrder(defaultOrder(DEFAULT_VISIBLE, isHidden));
  }

  function apply() {
    const cols = order.filter((k) => selected.includes(k) && !isHidden(k));
    const next = isHidden(PINNED) ? cols : [PINNED, ...cols];
    onApply(next);
    onClose();
  }

  const count = selected.filter((k) => !isHidden(k)).length + (isHidden(PINNED) ? 0 : 1);

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
          {!isHidden(PINNED) && (
            <div className="col-picker-row col-picker-row-locked" title="Colonne ancrée — toujours visible">
              <Pin size={13} className="col-picker-grip" />
              <label>
                <input type="checkbox" checked disabled />
                <span>{byKey[PINNED].label}</span>
              </label>
            </div>
          )}
          {order.map((key, i) => {
            const f = byKey[key];
            if (!f || isHidden(key)) return null;
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
