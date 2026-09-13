const XLSX = require('xlsx');
const { FIELDS } = require('./contract-fields');

const FIELD_BY_LABEL = new Map(FIELDS.map((f) => [f.label, f]));
// Certains en-têtes du fichier réel diffèrent légèrement du modèle → alias tolérés.
const LABEL_ALIASES = {
  'Product Group': 'Product_group',
  'Customer Group': 'Customer group',
  'Remarks Bac': 'Remarks bac',
  'Remarks Bac 2': 'Remarks bac 2',
  'Product_group ': 'Product_group',
  'Customer Name ': 'Customer Name'
};

function trim(s) {
  return String(s == null ? '' : s).replace(/\u00a0/g, ' ').trim();
}

function toText(v) {
  if (v == null) return null;
  const s = trim(v);
  return s || null;
}

function localDay(v) {
  return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}-${String(v.getDate()).padStart(2, '0')}`;
}

// Date JJ/MM/AAAA, ISO AAAA-MM-JJ, serial Excel ou objet Date → AAAA-MM-JJ
function toDate(v) {
  if (v == null || v === '') return null;
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    return localDay(v);
  }
  if (typeof v === 'number') {
    const d = new Date(Math.round((v - 25569) * 86400 * 1000));
    return Number.isNaN(d.getTime()) ? null : localDay(d);
  }
  const s = trim(v);
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const [, d, mo, y] = m;
    return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : new Date(t).toISOString().slice(0, 10);
}

function toInt(v) {
  if (v == null) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? Math.round(v) : null;
  const s = trim(String(v));
  if (!s) return null;
  const n = Number(s);
  return Number.isNaN(n) ? null : Math.round(n);
}

function toReal(v) {
  if (v == null) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? Math.round(v * 100) / 100 : null;
  let s = trim(String(v)).replace(/[^\d.,-]/g, '');
  if (!s) return null;
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma > lastDot) s = s.replace(/\./g, '').replace(',', '.');
  const n = Number(s);
  return Number.isNaN(n) ? null : Math.round(n * 100) / 100;
}

const NORMALIZERS = {
  text: toText,
  date: toDate,
  int: toInt,
  real: toReal
};

function resolveIndex(headers) {
  const index = new Map();
  headers.forEach((h, i) => index.set(trim(h), i));
  return (label) => {
    let key = label;
    if (!index.has(key)) {
      const aliased = LABEL_ALIASES[label];
      if (aliased) key = aliased;
      else return -1;
    }
    return index.has(key) ? index.get(key) : -1;
  };
}

// Analyse un flux/chemin Excel → { rows, ignored, errors }
// rows : objets prêts à insérer (toutes les colonnes du modèle, types normalisés)
function parseWorkbook(input, { source = 'buffer' } = {}) {
  // cellDates:false → les dates restent des serials Excel numériques ; les champs
  // de type 'date' sont alors reconvertis via la valeur brute (fiable), les autres
  // colonnes (texte) sont conservées telles quelles.
  const wb = source === 'path'
    ? XLSX.readFile(input, { cellDates: false })
    : XLSX.read(input, { type: 'buffer', cellDates: false });

  if (!wb.SheetNames.length) {
    return { rows: [], ignored: 0, errors: ['Fichier sans feuille de calcul'] };
  }

  const sheetName = wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const raw = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });
  if (!raw.length) {
    return { rows: [], ignored: 0, errors: ['Feuille vide'] };
  }

  const getIdx = resolveIndex(raw[0]);
  const rows = [];
  let ignored = 0;
  const errors = [];

  for (let i = 1; i < raw.length; i++) {
    const line = raw[i] || [];
    const row = {};
    let filled = false;

    for (const f of FIELDS) {
      const idx = getIdx(f.label);
      const value = idx === -1 ? null : line[idx];
      let norm = null;
      try {
        norm = NORMALIZERS[f.type](value);
      } catch {
        norm = null;
      }
      if (norm !== null && norm !== '' && norm !== undefined) filled = true;
      row[f.field] = norm;
    }

    if (!filled) {
      if (trim(line[0]) === '' && trim(line[5]) === '') ignored++;
      continue;
    }
    rows.push(row);
  }

  // Contrôle : si aucune colonne du modèle reconnue, alerte
  if (!rows.length && ignored === 0) {
    const sample = raw[0].map((h) => trim(h)).filter(Boolean);
    if (!sample.length) {
      errors.push('Aucune ligne à importer');
    } else {
      errors.push(`Aucun en-tête reconnu (vus : ${sample.slice(0, 8).join(', ')}…)`);
    }
  }

  return { rows, ignored, errors };
}

module.exports = { parseWorkbook, FIELDS };