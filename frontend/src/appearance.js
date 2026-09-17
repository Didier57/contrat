import React from 'react';
import { FIELDS } from './contractFields.js';

const DEFAULT_FONT = "'Segoe UI', system-ui, -apple-system, sans-serif";

const DEFAULT_FULL_WIDTH = ['customer_name', 'special_conditions', 'remarks_bac', 'remarks_bac_2'];

export const COLOR_FIELDS = [
  { key: '--primary', label: 'Couleur principale' },
  { key: '--primary-dark', label: 'Principale (survol)' },
  { key: '--bg', label: 'Fond de page' },
  { key: '--surface', label: 'Cartes / panneaux' },
  { key: '--surface-2', label: 'En-têtes de tableau' },
  { key: '--surface-3', label: 'Champs de saisie' },
  { key: '--border', label: 'Bordures' },
  { key: '--text', label: 'Texte' },
  { key: '--muted', label: 'Texte secondaire' },
  { key: '--success', label: 'Succès (vert)' },
  { key: '--warning', label: 'Avertissement (orange)' },
  { key: '--danger', label: 'Danger (rouge)' },
];

export const FONT_CHOICES = [
  { label: 'Système (par défaut)', value: DEFAULT_FONT },
  { label: 'Segoe UI', value: "'Segoe UI', system-ui, sans-serif" },
  { label: 'Arial / Helvetica', value: 'Arial, Helvetica, sans-serif' },
  { label: 'Verdana', value: 'Verdana, Geneva, sans-serif' },
  { label: 'Tahoma', value: 'Tahoma, Geneva, sans-serif' },
  { label: 'Trebuchet MS', value: "'Trebuchet MS', sans-serif" },
  { label: 'Georgia', value: 'Georgia, serif' },
  { label: 'Times New Roman', value: "'Times New Roman', Times, serif" },
  { label: 'Consolas (monospace)', value: 'Consolas, Monaco, monospace' },
];

const FIELD_KEYS = FIELDS.map((f) => f.key);

export const DEFAULT_APPEARANCE = {
  app_name: 'Contrats',
  logo: '📝',
  font_family: DEFAULT_FONT,
  colors: {},
  colors_dark: {},
  form_order: FIELD_KEYS.slice(),
  form_width: {},
};

export function normalizeAppearance(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const order = Array.isArray(src.form_order) ? src.form_order.filter((k) => FIELD_KEYS.includes(k)) : [];
  for (const k of FIELD_KEYS) if (!order.includes(k)) order.push(k);
  return {
    app_name: typeof src.app_name === 'string' && src.app_name.trim() ? src.app_name : DEFAULT_APPEARANCE.app_name,
    logo: typeof src.logo === 'string' ? src.logo : DEFAULT_APPEARANCE.logo,
    font_family: typeof src.font_family === 'string' && src.font_family.trim() ? src.font_family : DEFAULT_FONT,
    colors: src.colors && typeof src.colors === 'object' ? { ...src.colors } : {},
    colors_dark: src.colors_dark && typeof src.colors_dark === 'object' ? { ...src.colors_dark } : {},
    form_order: order,
    form_width: src.form_width && typeof src.form_width === 'object' ? { ...src.form_width } : {},
  };
}

export function formFieldOrder(appearance) {
  const src = appearance && Array.isArray(appearance.form_order) && appearance.form_order.length ? appearance.form_order : FIELD_KEYS;
  const out = [];
  for (const k of src) if (FIELD_KEYS.includes(k) && !out.includes(k)) out.push(k);
  for (const k of FIELD_KEYS) if (!out.includes(k)) out.push(k);
  return out;
}

export function fieldWidth(appearance, key) {
  const w = appearance && appearance.form_width ? appearance.form_width[key] : undefined;
  if (w === 'full' || w === 'half' || w === 'quarter') return w;
  return DEFAULT_FULL_WIDTH.includes(key) ? 'full' : 'half';
}

export function isFullWidth(appearance, key) {
  return fieldWidth(appearance, key) === 'full';
}

function cssVars(obj) {
  return Object.entries(obj || {})
    .filter(([k, v]) => /^--[a-z0-9-]+$/i.test(k) && typeof v === 'string' && v.trim())
    .map(([k, v]) => `  ${k}: ${v.trim()};`)
    .join('\n');
}

export function buildAppearanceCss(appearance) {
  const a = normalizeAppearance(appearance);
  const blocks = [];
  const light = cssVars(a.colors);
  if (light) blocks.push(`:root {\n${light}\n}`);
  if (a.font_family) {
    blocks.push(`body, input, select, textarea, button { font-family: ${a.font_family}; }`);
  }
  const dark = cssVars(a.colors_dark);
  if (dark) blocks.push(`[data-theme="dark"] {\n${dark}\n}`);
  return blocks.join('\n');
}

export function applyAppearance(appearance) {
  if (typeof document === 'undefined') return;
  let el = document.getElementById('app-appearance');
  if (!el) {
    el = document.createElement('style');
    el.id = 'app-appearance';
    document.head.appendChild(el);
  }
  el.textContent = buildAppearanceCss(appearance);
}

export const AppearanceContext = React.createContext({ appearance: DEFAULT_APPEARANCE, updateAppearance: () => {} });

export function useAppearance() {
  return React.useContext(AppearanceContext);
}
