import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { api } from '../api.js';
import { useAuth } from '../App.jsx';
import { formatDate, daysUntil } from '../utils.js';
import { FIELDS, DEFAULT_WIDTHS, DEFAULT_VISIBLE } from '../contractFields.js';
import ContractForm from '../components/ContractForm.jsx';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import ColumnFilter from '../components/ColumnFilter.jsx';
import ColumnsPicker from '../components/ColumnsPicker.jsx';
import ImportExcelModal from '../components/ImportExcelModal.jsx';
import { Plus, FileSpreadsheet, Search, X, Filter, UploadCloud, Columns3, Pencil, Trash2 } from 'lucide-react';

const MOIS = ['jan', 'fév', 'mar', 'avr', 'mai', 'juin', 'juil', 'août', 'sep', 'oct', 'nov', 'déc'];

export function getCellKey(r, col) {
  const v = r[col.key];
  if (col.bool) return Number(v) === 1 ? '1' : '0';
  if (col.type === 'date') {
    if (!v) return '__EMPTY__';
    return v.slice(0, 7);
  }
  if (v === null || v === undefined || v === '') return '__EMPTY__';
  return String(v);
}

export function getCellLabel(col, key) {
  if (key === '__EMPTY__') return '(vide)';
  if (col.bool) return key === '1' ? 'Oui' : 'Non';
  if (col.type === 'date') {
    const [y, m] = key.split('-');
    return `${MOIS[Number(m) - 1]} ${y}`;
  }
  return key;
}

export default function Contrats() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [allRows, setAllRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [visible, setVisible] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('contrats-visible-cols'));
      if (Array.isArray(saved) && saved.length) {
        return saved.includes('remarks_bac') ? saved : [...saved, 'remarks_bac'];
      }
      return DEFAULT_VISIBLE;
    } catch {
      return DEFAULT_VISIBLE;
    }
  });
  const COLUMNS = useMemo(() => {
    const cols = FIELDS.filter((f) => visible.includes(f.key));
    const i = cols.findIndex((c) => c.key === 'customer_name');
    if (i < 1) return cols; // déjà en premier (ou invisible)
    const cust = cols[i];
    return [cust, ...cols.slice(0, i), ...cols.slice(i + 1)]; // Customer Name toujours en tête
  }, [visible]);

  const [search, setSearch] = useState('');
  const [colFilters, setColFilters] = useState({ contract_stop: ['0'] }); // Par défaut : contrat non stoppés
  const [filterOpen, setFilterOpen] = useState(null);
  const [dateRanges, setDateRanges] = useState({});

  const [sortKey, setSortKey] = useState('customer_name');
  const [sortDir, setSortDir] = useState('asc');

  // ==== Redimensionnement des colonnes ====
  function pctToPx(total) {
    const out = {};
    for (const f of FIELDS) out[f.key] = Math.max(45, Math.round((total * (DEFAULT_WIDTHS[f.key] || 8)) / 100));
    return out;
  }
  const wrapRef = useRef(null);
  const dragRef = useRef(false);
  const WIDTHS_KEY = 'contrats-colwidths';

  function loadWidths(total) {
    const base = pctToPx(total);
    if (typeof localStorage === 'undefined') return base;
    try {
      const saved = JSON.parse(localStorage.getItem(WIDTHS_KEY) || '{}');
      for (const k of Object.keys(saved)) if (k in base) base[k] = saved[k];
    } catch { /* ignore */ }
    return base;
  }

  function persistWidths(widths) {
    try { localStorage.setItem(WIDTHS_KEY, JSON.stringify(widths)); } catch { /* ignore */ }
  }

  const [colWidths, setColWidths] = useState(() => loadWidths(1400));

  useEffect(() => {
    if (wrapRef.current) setColWidths(loadWidths(wrapRef.current.clientWidth));
  }, []);

  function startResize(e, key) {
    e.preventDefault();
    e.stopPropagation();
    dragRef.current = false;
    const startX = e.clientX;
    const startW = colWidths[key] || 120;
    const onMove = (ev) => {
      const delta = ev.clientX - startX;
      if (Math.abs(delta) > 3) dragRef.current = true;
      setColWidths((prev) => {
        const next = { ...prev, [key]: Math.max(45, startW + delta) };
        persistWidths(next);
        return next;
      });
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      setTimeout(() => { dragRef.current = false; }, 0);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }

  function resetColWidth(key) {
    const total = wrapRef.current ? wrapRef.current.clientWidth : 1400;
    setColWidths((prev) => {
      const next = { ...prev, [key]: pctToPx(total)[key] };
      persistWidths(next);
      return next;
    });
  }

  const [editing, setEditing] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [toast, setToast] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get('/contracts');
      setAllRows(data);
      setError('');
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function applyFilters(rows, colFiltersToApply, skipKey) {
    let arr = rows;

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      arr = arr.filter((r) =>
        FIELDS.some((f) => String(r[f.key] || '').toLowerCase().includes(q))
      );
    }

    for (const [key, values] of Object.entries(colFiltersToApply)) {
      if (key === skipKey) continue;
      if (!values || values.length === 0) continue;
      const col = FIELDS.find((f) => f.key === key);
      arr = arr.filter((r) => values.includes(getCellKey(r, col)));
    }

    for (const [key, rng] of Object.entries(dateRanges)) {
      if (key === skipKey) continue;
      if (!rng || (!rng.from && !rng.to)) continue;
      arr = arr.filter((r) => {
        const v = String(r[key] || '');
        if (!v) return false;
        if (rng.from && v < rng.from) return false;
        if (rng.to && v > rng.to) return false;
        return true;
      });
    }
    return arr;
  }

  const filtered = useMemo(() => {
    let arr = applyFilters(allRows, colFilters, null);
    arr = [...arr];
    arr.sort((a, b) => {
      const col = FIELDS.find((f) => f.key === sortKey) || {};
      let va, vb;
      if (col.type === 'int' || col.type === 'real' || col.bool) {
        va = Number(a[sortKey]) || 0; vb = Number(b[sortKey]) || 0;
        return (va - vb) * (sortDir === 'asc' ? 1 : -1);
      }
      va = a[sortKey] == null ? '' : String(a[sortKey]);
      vb = b[sortKey] == null ? '' : String(b[sortKey]);
      return String(va).localeCompare(String(vb), 'fr', { numeric: true }) * (sortDir === 'asc' ? 1 : -1);
    });
    return arr;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allRows, search, colFilters, dateRanges, sortKey, sortDir]);

  const openCol = FIELDS.find((f) => f.key === filterOpen) || null;
  const filterOptions = useMemo(() => {
    if (!openCol) return [];
    const base = applyFilters(allRows, colFilters, filterOpen);
    const map = {};
    for (const r of base) {
      const k = getCellKey(r, openCol);
      map[k] = (map[k] || 0) + 1;
    }
    const toSort = Object.entries(map).map(([k, count]) => ({ key: k, label: getCellLabel(openCol, k), count }));
    const empty = toSort.find((o) => o.key === '__EMPTY__');
    const others = toSort.filter((o) => o.key !== '__EMPTY__')
      .sort((a, b) => a.label.localeCompare(b.label, 'fr', { numeric: true }));
    return empty ? [...others, empty] : others;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allRows, filterOpen, colFilters, dateRanges, search]);

  function onSort(key) {
    if (key === sortKey) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('asc'); }
  }

  function toggleFilterColumn(key) {
    setFilterOpen((cur) => (cur === key ? null : key));
  }

  function toggleColValue(key, value) {
    setColFilters((f) => {
      const cur = f[key] || [];
      const next = cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value];
      const o = { ...f, [key]: next };
      if (next.length === 0) delete o[key];
      return o;
    });
  }

  function clearColFilter(key) {
    setColFilters((f) => { const o = { ...f }; delete o[key]; return o; });
  }

  function setDateRange(key, side, value) {
    setDateRanges((d) => {
      const cur = d[key] || { from: '', to: '' };
      const next = { ...cur, [side]: value };
      const o = { ...d, [key]: next };
      if (!next.from && !next.to) delete o[key];
      return o;
    });
  }

  function clearDateRange(key) {
    setDateRanges((d) => { const o = { ...d }; delete o[key]; return o; });
  }

  function hasActiveColFilter() {
    return Object.entries(colFilters).some(
      ([k, v]) => k !== 'contract_stop' && Array.isArray(v) && v.length > 0
    ) || Object.values(dateRanges).some((r) => r && (r.from || r.to));
  }

  function showToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(''), 2500);
  }

  async function handleDelete() {
    if (!confirmDelete) return;
    setDeleting(true);
    try {
      await api.del(`/contracts/${confirmDelete.id}`);
      setConfirmDelete(null);
      showToast('Supprimé');
      load();
    } catch (e) {
      showToast(e.message);
      setConfirmDelete(null);
    } finally {
      setDeleting(false);
    }
  }

  function onColumnsApply(next) {
    setColFilters((f) => {
      const o = { ...f };
      for (const k of Object.keys(o)) if (!next.includes(k)) delete o[k];
      return o;
    });
    setDateRanges((d) => {
      const o = { ...d };
      for (const k of Object.keys(o)) if (!next.includes(k)) delete o[k];
      return o;
    });
  }

  async function exportExcel() {
    const XLSX = await import('exceljs');
    const saveAs = (await import('file-saver')).saveAs;
    const wb = new XLSX.Workbook();
    const ws = wb.addWorksheet('Contrats');
    ws.columns = COLUMNS.map((c) => ({ header: c.label, key: c.key, width: 18 }));
    ws.addRows(filtered.map((r) => {
      const o = {};
      for (const c of COLUMNS) o[c.key] = r[c.key] ?? '';
      return o;
    }));
    const buf = await wb.xlsx.writeBuffer();
    saveAs(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), 'contrats.xlsx');
    showToast('Export Excel généré');
  }

  function clearFilters() {
    setSearch('');
    setColFilters({ contract_stop: ['0'] }); // retour à la vue par défaut
    setDateRanges({});
    setSortKey('customer_name');
    setSortDir('asc');
    setFilterOpen(null);
  }

  const searchableCount = FIELDS.length;

  return (
    <div className="clients-page">
      <div className="page-header">
        <div>
          <h2>Contrats</h2>
          <div className="sub">{filtered.length} enregistrement{filtered.length > 1 ? 's' : ''} sur {allRows.length}</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-ghost btn-sm" onClick={exportExcel}><FileSpreadsheet size={15} /> Excel</button>
          <button className="btn btn-ghost btn-sm" onClick={() => setPickerOpen(true)}><Columns3 size={15} /> Choisir des colonnes</button>
          {isAdmin && (
            <button className="btn btn-ghost btn-sm" onClick={() => setImportOpen(true)}>
              <UploadCloud size={15} /> <span style={{ color: '#1d4ed8' }}>Importer Excel</span>
            </button>
          )}
          {isAdmin && (
            <button className="btn btn-primary btn-sm" onClick={() => setEditing({})}>
              <Plus size={15} /> Ajouter
            </button>
          )}
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="toolbar">
        <div style={{ position: 'relative' }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: 10, color: '#64748b' }} />
          <input
            type="text"
            placeholder={`Rechercher (${searchableCount} colonnes)...`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ paddingLeft: 30 }}
          />
        </div>
        <button className="btn btn-xs btn-ghost" onClick={clearFilters}><X size={12} /> Réinitialiser</button>
      </div>

      <div className="table-wrap" ref={wrapRef}>
        {loading ? (
          <div className="empty-state"><span className="spinner" /></div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">Aucun contrat trouvé</div>
        ) : (
          <table className="table table-compact clients-bordered">
            <thead>
              <tr>
                {COLUMNS.map((c) => {
                  const colActive =
                    (Array.isArray(colFilters[c.key]) && colFilters[c.key].length > 0) ||
                    !!(dateRanges[c.key] && (dateRanges[c.key].from || dateRanges[c.key].to));
                  return (
                    <th key={c.key} style={{ width: colWidths[c.key], textAlign: (c.bool || c.type === 'int' || c.type === 'real') ? 'center' : 'left' }} onClick={() => { if (!dragRef.current) onSort(c.key); }}>
                      <span className="th-label">{c.label}</span>
                      <span className="th-meta">
                        <span className="th-sort">{sortKey === c.key ? (sortDir === 'asc' ? '▲' : '▼') : '⇅'}</span>
                        <button
                          className={`filter-funnel ${colActive ? 'active' : ''}`}
                          onClick={(e) => { e.stopPropagation(); toggleFilterColumn(c.key); }}
                          title="Filtrer"
                        >
                          <Filter size={11} />
                        </button>
                      </span>
                      <span
                        className="col-resize-handle"
                        onMouseDown={(e) => startResize(e, c.key)}
                        onDoubleClick={(e) => { e.stopPropagation(); resetColWidth(c.key); }}
                        title="Glisser pour redimensionner · Double-clic : largeur par défaut"
                      />
                      {filterOpen === c.key && openCol && (
                        c.type === 'date' ? (
                          <ColumnFilter
                            type="date"
                            label={c.label}
                            range={dateRanges[c.key]}
                            onRangeChange={(side, v) => setDateRange(c.key, side, v)}
                            onClear={() => clearDateRange(c.key)}
                            onClose={() => setFilterOpen(null)}
                            options={[]}
                            selected={[]}
                            onToggle={() => {}}
                          />
                        ) : (
                          <ColumnFilter
                            label={c.label}
                            options={filterOptions}
                            selected={colFilters[c.key] || []}
                            onToggle={(v) => toggleColValue(c.key, v)}
                            onClear={() => clearColFilter(c.key)}
                            onClose={() => setFilterOpen(null)}
                          />
                        )
                      )}
                    </th>
                  );
                })}
                {isAdmin && <th style={{ width: 70 }}>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const d = daysUntil(r.contract_end);
                const cellDateClass = d != null && d < 0 ? 'cell-red' : d != null && d <= 90 ? 'cell-orange' : '';
                return (
                  <tr key={r.id}>
                    {COLUMNS.map((c) => {
                      const v = r[c.key];
                      let content;
                      let className = '';
                      if (c.bool) {
                        content = (
                          <input
                            type="checkbox"
                            checked={Number(v) === 1}
                            disabled
                            title={Number(v) === 1 ? 'Oui' : 'Non'}
                          />
                        );
                        className = 'cell-check text-center';
                      } else if (c.type === 'date') {
                        content = formatDate(v);
                        className = c.key === 'contract_end' ? cellDateClass : '';
                      } else if (c.type === 'int' || c.type === 'real') {
                        content = v == null || v === '' ? '—' : Number(v).toLocaleString('fr-FR', { maximumFractionDigits: 2 });
                        className = 'text-right';
                      } else {
                        content = v == null || v === '' ? '—' : String(v);
                      }
                      return (
                        <td key={c.key} className={className} title={v == null || v === '' ? '—' : String(v)}>
                          {content}
                        </td>
                      );
                    })}
                    {isAdmin && (
                      <td className="row-actions">
                        <button className="btn btn-xs btn-ghost" onClick={() => setEditing(r)} title="Modifier"><Pencil size={13} /></button>
                        <button className="btn btn-xs btn-danger" onClick={() => setConfirmDelete(r)} title="Supprimer"><Trash2 size={13} /></button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        <div className="table-footer">
          <span>{filtered.length} ligne{filtered.length > 1 ? 's' : ''}</span>
          {hasActiveColFilter() && <span className="badge badge-blue">Filtres colonnes actifs</span>}
          {!isAdmin && <span>Mode lecture seule</span>}
        </div>
      </div>

      {importOpen && isAdmin && (
        <ImportExcelModal
          onClose={() => setImportOpen(false)}
          onDone={() => { setImportOpen(false); load(); }}
        />
      )}
      {pickerOpen && (
        <ColumnsPicker onClose={() => setPickerOpen(false)} onApply={onColumnsApply} />
      )}
      {editing && isAdmin && (
        <ContractForm
          contract={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            showToast('Enregistré');
            load();
          }}
        />
      )}
      {confirmDelete && isAdmin && (
        <ConfirmDialog
          title="Supprimer ce contrat ?"
          message={`« ${confirmDelete.customer_name} » (${confirmDelete.sap_ewp || confirmDelete.sap_eupac || 'n° ' + confirmDelete.import_id}) sera définitivement supprimé. Cette action est irréversible.`}
          onCancel={() => setConfirmDelete(null)}
          onConfirm={handleDelete}
          loading={deleting}
        />
      )}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}