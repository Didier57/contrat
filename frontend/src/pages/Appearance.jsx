import React, { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { FIELDS } from '../contractFields.js';
import { Save, Palette, RotateCcw, GripVertical, Type, LayoutGrid, Sun, Moon } from 'lucide-react';
import {
  COLOR_FIELDS,
  FONT_CHOICES,
  DEFAULT_APPEARANCE,
  normalizeAppearance,
  formFieldOrder,
  fieldWidth,
  useAppearance
} from '../appearance.js';

const LABELS = {};
for (const f of FIELDS) LABELS[f.key] = f.label;

const DEFAULT_LIGHT = {
  '--primary': '#1d4ed8',
  '--primary-dark': '#1e40af',
  '--bg': '#f1f5f9',
  '--surface': '#ffffff',
  '--surface-2': '#f8fafc',
  '--surface-3': '#f1f5f9',
  '--border': '#e2e8f0',
  '--text': '#0f172a',
  '--muted': '#64748b',
  '--success': '#16a34a',
  '--warning': '#d97706',
  '--danger': '#dc2626'
};

const DEFAULT_DARK = {
  '--primary': '#3b82f6',
  '--primary-dark': '#2563eb',
  '--bg': '#0b1220',
  '--surface': '#111a2b',
  '--surface-2': '#172136',
  '--surface-3': '#1c2941',
  '--border': '#26334c',
  '--text': '#e5eaf3',
  '--muted': '#93a1b8',
  '--success': '#4ade80',
  '--warning': '#fbbf24',
  '--danger': '#f87171'
};

// Regroupe les champs masqués à la fin de la liste (ordre relatif conservé).
function hiddenLast(order, form_width) {
  const rank = (k) => (form_width && form_width[k] === 'hidden' ? 1 : 0);
  return [...order].sort((a, b) => rank(a) - rank(b));
}

export default function Appearance() {
  const { updateAppearance } = useAppearance();
  const [form, setForm] = useState(() => normalizeAppearance(DEFAULT_APPEARANCE));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const dragIndex = useRef(null);

  function showToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(''), 3500);
  }

  useEffect(() => {
    api.get('/appearance')
      .then((data) => {
        const a = normalizeAppearance(data);
        a.form_order = hiddenLast(a.form_order, a.form_width);
        setForm(a);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const setField = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const setColor = (theme, key, value) =>
    setForm((f) => ({ ...f, [theme]: { ...f[theme], [key]: value } }));
  const clearColor = (theme, key) =>
    setForm((f) => {
      const next = { ...f[theme] };
      delete next[key];
      return { ...f, [theme]: next };
    });
  const setWidth = (key, value) =>
    setForm((f) => {
      const form_width = { ...f.form_width, [key]: value };
      const form_order = value === 'hidden' ? hiddenLast(f.form_order, form_width) : f.form_order;
      return { ...f, form_width, form_order };
    });
  const setLabel = (key, value) =>
    setForm((f) => {
      const next = { ...f.field_labels };
      if (value && value.trim()) next[key] = value;
      else delete next[key];
      return { ...f, field_labels: next };
    });

  function move(from, to) {
    if (to < 0 || to >= form.form_order.length || from === to) return;
    const order = form.form_order.slice();
    const [item] = order.splice(from, 1);
    order.splice(to, 0, item);
    setField('form_order', order);
  }

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const clean = normalizeAppearance(form);
      await api.put('/appearance', clean);
      updateAppearance(clean);
      setForm(clean);
      showToast('Apparence enregistrée.');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  function handleReset() {
    setForm(normalizeAppearance(DEFAULT_APPEARANCE));
    showToast('Valeurs par défaut rétablies — cliquez sur Enregistrer pour appliquer.');
  }

  function renderColors(theme, defaults, title, icon) {
    return (
      <section className="panel">
        <div className="panel-title">{icon} {title}</div>
        <div className="appearance-colors">
          {COLOR_FIELDS.map((c) => (
            <div className="appearance-color" key={c.key}>
              <input
                type="color"
                value={form[theme][c.key] || defaults[c.key] || '#000000'}
                onChange={(e) => setColor(theme, c.key, e.target.value)}
                aria-label={c.label}
              />
              <div className="appearance-color-label">
                <span>{c.label}</span>
                {form[theme][c.key] && (
                  <button type="button" className="appearance-clear" onClick={() => clearColor(theme, c.key)} title="Revenir à la valeur par défaut">
                    <RotateCcw size={12} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
        <div className="panel-sub">Laissez la valeur par défaut (icône ↺) ou choisissez une couleur. Les deux thèmes sont indépendants.</div>
      </section>
    );
  }

  if (loading) return <div className="empty-state"><span className="spinner" /></div>;

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Apparence</h2>
          <div className="sub">Personnalisez les couleurs, la police et la disposition du formulaire de contrat</div>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}
      {toast && <div className="toast">{toast}</div>}

      <form onSubmit={handleSave}>
        <div className="settings-grid">
          <section className="panel">
            <div className="panel-title"><Palette size={16} /> Identité</div>
            <div className="form-row">
              <div className="field">
                <label>Nom de l'application</label>
                <input
                  type="text"
                  value={form.app_name}
                  onChange={(e) => setField('app_name', e.target.value)}
                  placeholder="Contrats"
                />
              </div>
              <div className="field">
                <label>Logo (emoji ou texte court)</label>
                <input
                  type="text"
                  value={form.logo}
                  onChange={(e) => setField('logo', e.target.value)}
                  placeholder="📝"
                  maxLength={4}
                />
              </div>
            </div>
            <div className="field">
              <label><Type size={13} /> Police de caractères</label>
              <select value={form.font_family} onChange={(e) => setField('font_family', e.target.value)}>
                {FONT_CHOICES.map((f) => (
                  <option key={f.value} value={f.value}>{f.label}</option>
                ))}
              </select>
            </div>
          </section>

          {renderColors('colors', DEFAULT_LIGHT, 'Couleurs — thème clair', <Sun size={16} />)}
          {renderColors('colors_dark', DEFAULT_DARK, 'Couleurs — thème sombre', <Moon size={16} />)}

          <section className="panel">
            <div className="panel-title"><LayoutGrid size={16} /> Disposition du formulaire de contrat</div>
            <div className="panel-sub" style={{ marginBottom: 10 }}>
              Glissez-déposez pour changer l'ordre des champs, et choisissez leur largeur (demi-colonne ou pleine largeur).
            </div>
            <div className="appearance-fields">
              {form.form_order.map((key, index) => (
                <div
                  className="appearance-field-row"
                  key={key}
                  draggable
                  onDragStart={() => { dragIndex.current = index; }}
                  onDragEnter={() => { if (dragIndex.current !== null) { move(dragIndex.current, index); dragIndex.current = index; } }}
                  onDragOver={(e) => e.preventDefault()}
                  onDragEnd={() => { dragIndex.current = null; }}
                >
                  <GripVertical size={14} className="appearance-grip" />
                  <span className="appearance-field-label">{LABELS[key] || key}</span>
                  <input
                    className="appearance-label-input"
                    type="text"
                    value={form.field_labels[key] || ''}
                    onChange={(e) => setLabel(key, e.target.value)}
                    placeholder={LABELS[key] || key}
                    title="Nom affiché dans la table et le formulaire (n'affecte pas la base de données)"
                  />
                  <select
                    value={fieldWidth(form, key)}
                    onChange={(e) => setWidth(key, e.target.value)}
                  >
                    <option value="quarter">1/4</option>
                    <option value="half">Demi</option>
                    <option value="full">Pleine</option>
                    <option value="hidden">Masquer</option>
                  </select>
                </div>
              ))}
            </div>
          </section>
        </div>

        <div className="appearance-actions">
          <button type="button" className="btn btn-ghost" onClick={handleReset}>
            <RotateCcw size={14} /> Réinitialiser
          </button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            <Save size={14} /> {saving ? <span className="spinner" /> : 'Enregistrer'}
          </button>
        </div>
      </form>
    </div>
  );
}
