export function formatDate(v) {
  if (!v) return '—';
  const d = new Date(v);
  if (isNaN(d)) return v;
  return d.toLocaleDateString('fr-FR');
}

export function daysUntil(dateStr) {
  if (!dateStr) return null;
  const target = new Date(dateStr + 'T00:00:00');
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.round((target - now) / 86400000);
}

export function exportCsv(rows, filename) {
  if (!rows.length) return;
  const cols = Object.keys(rows[0]);
  const header = cols.join(';');
  const lines = rows.map(r => cols.map(c => {
    const v = r[c] == null ? '' : String(r[c]);
    return '"' + v.replace(/"/g, '""') + '"';
  }).join(';'));
  const csv = '\uFEFF' + [header, ...lines].join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
