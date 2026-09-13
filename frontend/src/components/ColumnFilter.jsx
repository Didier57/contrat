import React, { useMemo, useState } from 'react';
import { X, Search, CalendarRange } from 'lucide-react';

export default function ColumnFilter({
  label,
  type,
  options,
  selected,
  onToggle,
  onClear,
  onClose,
  range,
  onRangeChange
}) {
  const [q, setQ] = useState('');
  const isDate = type === 'date';

  const filteredOptions = useMemo(
    () => options.filter((o) => o.label.toLowerCase().includes(q.toLowerCase())),
    [options, q]
  );

  const allSelected = options.length > 0 && options.every((o) => selected.includes(o.key));

  function toggleSelectAll() {
    if (allSelected) {
      options.forEach((o) => onToggle(o.key, false));
    } else {
      options.forEach((o) => onToggle(o.key, true));
    }
  }

  return (
    <div className="cf-panel" onClick={(e) => e.stopPropagation()}>
      <div className="cf-header">
        <strong>{label}</strong>
        <button className="cf-close" onClick={onClose} title="Fermer"><X size={14} /></button>
      </div>

      {isDate ? (
        <div className="cf-date-range">
          <div className="cf-date-label"><CalendarRange size={13} /> Filtrer par plage de dates</div>
          <label className="cf-date-field">
            <span>Du</span>
            <input
              type="date"
              value={range?.from || ''}
              onChange={(e) => onRangeChange('from', e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') onClose(); }}
            />
          </label>
          <label className="cf-date-field">
            <span>Au</span>
            <input
              type="date"
              value={range?.to || ''}
              onChange={(e) => onRangeChange('to', e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') onClose(); }}
            />
          </label>
          <div className="cf-date-hint">Bornes incluses. Les lignes sans date sont masquées.</div>
        </div>
      ) : (
        <>
          <div className="cf-search">
            <Search size={13} />
            <input
              type="text"
              placeholder="Rechercher..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
              autoFocus
            />
          </div>
          <label className="cf-item cf-all">
            <input
              type="checkbox"
              checked={allSelected}
              ref={(el) => { if (el) el.indeterminate = !allSelected && options.some((o) => selected.includes(o.key)); }}
              onChange={toggleSelectAll}
            />
            <span className="cf-label">(Tout sélectionner)</span>
          </label>
          <div className="cf-list">
            {filteredOptions.length === 0 && <div className="cf-empty">Aucune valeur</div>}
            {filteredOptions.map((o) => (
              <label key={o.key} className="cf-item">
                <input
                  type="checkbox"
                  checked={selected.includes(o.key)}
                  onChange={() => onToggle(o.key, !selected.includes(o.key))}
                />
                <span className="cf-label" title={o.label}>{o.label}</span>
                <span className="cf-count">{o.count}</span>
              </label>
            ))}
          </div>
        </>
      )}

      <div className="cf-footer">
        <button className="btn btn-xs btn-ghost" onClick={onClear}>Effacer</button>
        <button className="btn btn-xs btn-primary" onClick={onClose}>OK</button>
      </div>
    </div>
  );
}