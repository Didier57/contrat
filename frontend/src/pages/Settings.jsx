import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import { Save, Mail, Settings2 } from 'lucide-react';

const EMPTY = {
  app: { url: '' },
  smtp: { host: '', port: 587, secure: false, user: '', pass: '', from: '', from_name: '' },
  notify: { login: false }
};

export default function Settings() {
  const [form, setForm] = useState(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [testEmail, setTestEmail] = useState('');

  function showToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(''), 3500);
  }

  async function load() {
    setLoading(true);
    try {
      const data = await api.get('/settings');
      setForm({
        app: {
          url: (data.app && data.app.url) || ''
        },
        smtp: {
          host: data.smtp.host,
          port: data.smtp.port,
          secure: data.smtp.secure,
          user: data.smtp.user,
          pass: '',
          from: data.smtp.from,
          from_name: data.smtp.from_name || ''
        },
        notify: {
          login: data.notify.login
        }
      });
      setTestEmail(localStorage.getItem('user') ? JSON.parse(localStorage.getItem('user')).email || '' : '');
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const setApp = (k, v) => setForm((f) => ({ ...f, app: { ...f.app, [k]: v } }));
  const setSmtp = (k, v) => setForm((f) => ({ ...f, smtp: { ...f.smtp, [k]: v } }));
  const setNotify = (k, v) => setForm((f) => ({ ...f, notify: { ...f.notify, [k]: v } }));

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const res = await api.put('/settings', form);
      showToast(res.smtpConfigured ? 'Paramètres enregistrés — SMTP prêt.' : 'Paramètres enregistrés. Complétez le SMTP pour l\'envoi.');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleTest(e) {
    e.preventDefault();
    setBusy('test');
    setError('');
    try {
      await api.post('/settings/test', { to: testEmail });
      showToast(`Email de test envoyé à ${testEmail || 'vous'} — vérifiez votre boîte.`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy('');
    }
  }

  if (loading) return <div className="empty-state"><span className="spinner" /></div>;

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Paramètres</h2>
          <div className="sub">Envoi d'emails (SMTP) et notifications</div>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}
      {toast && <div className="toast">{toast}</div>}

      <div className="settings-grid">
        <section className="panel">
          <div className="panel-title">
            <Settings2 size={16} /> Adresse de l'application
          </div>
          <form onSubmit={handleSave}>
            <div className="field">
              <label>URL publique</label>
              <input
                type="text"
                value={form.app.url}
                onChange={(e) => setApp('url', e.target.value)}
                placeholder="https://contrat.damovo.cloud"
              />
            </div>
            <div className="panel-sub">Utilisée pour construire les liens envoyés par email (invitation, réinitialisation du mot de passe). Laissez vide pour utiliser la valeur par défaut du serveur.</div>
            <div className="panel-actions">
              <button type="submit" className="btn btn-primary" disabled={saving}>
                <Save size={14} /> {saving ? <span className="spinner" /> : 'Enregistrer'}
              </button>
            </div>
          </form>
        </section>

        <section className="panel">
          <div className="panel-title">
            <Settings2 size={16} /> Serveur SMTP
          </div>
          <form onSubmit={handleSave}>
            <div className="field">
              <label>Hôte SMTP</label>
              <input
                type="text"
                value={form.smtp.host}
                onChange={(e) => setSmtp('host', e.target.value)}
                placeholder="smtp.exemple.com"
              />
            </div>
            <div className="form-row">
              <div className="field">
                <label>Port</label>
                <input
                  type="number"
                  value={form.smtp.port}
                  onChange={(e) => setSmtp('port', parseInt(e.target.value, 10) || 0)}
                  placeholder="587"
                />
              </div>
              <div className="field field-check">
                <label className="check-label">
                  <input
                    type="checkbox"
                    checked={form.smtp.secure}
                    onChange={(e) => setSmtp('secure', e.target.checked)}
                  />
                  SSL / TLS
                </label>
              </div>
            </div>
            <div className="form-row">
              <div className="field">
                <label>Utilisateur</label>
                <input
                  type="text"
                  value={form.smtp.user}
                  onChange={(e) => setSmtp('user', e.target.value)}
                  autoComplete="off"
                />
              </div>
              <div className="field">
                <label>Mot de passe <span className="field-hint">(vide = inchangé)</span></label>
                <input
                  type="password"
                  value={form.smtp.pass}
                  onChange={(e) => setSmtp('pass', e.target.value)}
                  autoComplete="new-password"
                />
              </div>
            </div>
            <div className="form-row">
              <div className="field">
                <label>Expéditeur (email)</label>
                <input
                  type="text"
                  value={form.smtp.from}
                  onChange={(e) => setSmtp('from', e.target.value)}
                  placeholder="no-reply@exemple.com"
                />
              </div>
              <div className="field">
                <label>Nom affiché chez le destinataire</label>
                <input
                  type="text"
                  value={form.smtp.from_name}
                  onChange={(e) => setSmtp('from_name', e.target.value)}
                  placeholder="Gestion des contrats"
                />
              </div>
            </div>
            <div className="field">
              <label>Email de test</label>
              <div className="field-row">
                <input
                  type="email"
                  value={testEmail}
                  onChange={(e) => setTestEmail(e.target.value)}
                  placeholder="votre@email.com"
                />
                <button type="button" className="btn" onClick={handleTest} disabled={busy === 'test'}>
                  <Mail size={14} /> {busy === 'test' ? <span className="spinner" /> : 'Envoyer un test'}
                </button>
              </div>
            </div>
            <div className="panel-actions">
              <button type="submit" className="btn btn-primary" disabled={saving}>
                <Save size={14} /> {saving ? <span className="spinner" /> : 'Enregistrer les paramètres'}
              </button>
            </div>
          </form>
        </section>

        <section className="panel">
          <div className="panel-title">
            <Settings2 size={16} /> Notifications
          </div>
          <form onSubmit={handleSave}>
            <div className="field field-check">
              <label className="check-label">
                <input
                  type="checkbox"
                  checked={form.notify.login}
                  onChange={(e) => setNotify('login', e.target.checked)}
                />
                Notifier les admins à chaque connexion
              </label>
            </div>
            <div className="panel-sub">Chaque administrateur ou éditeur règle ses propres rappels (activation, nombre de jours et heure d'envoi) depuis son profil.</div>
            <div className="panel-actions">
              <button type="submit" className="btn btn-primary" disabled={saving}>
                <Save size={14} /> {saving ? <span className="spinner" /> : 'Enregistrer'}
              </button>
            </div>
          </form>
        </section>
      </div>
    </div>
  );
}