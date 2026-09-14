import React, { useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../App.jsx';
import { X, Send, ShieldCheck } from 'lucide-react';

export default function ProfileModal({ onClose }) {
  const { user, updateUser } = useAuth();
  const [form, setForm] = useState({
    username: user?.username || '',
    email: user?.email || '',
    notify_expiry: !!user?.notify_expiry,
    notify_expiry_days: user?.notify_expiry_days ?? 7,
    notify_expiry_hour: user?.notify_expiry_hour ?? 8,
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });
  const canReceive = user?.role === 'admin' || user?.role === 'editeur';
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState('');
  const [sendingNow, setSendingNow] = useState(false);
  const [totpEnabled, setTotpEnabled] = useState(!!user?.totp_enabled);
  const [setup, setSetup] = useState(null);
  const [code2fa, setCode2fa] = useState('');
  const [busy2fa, setBusy2fa] = useState(false);
  const [msg2fa, setMsg2fa] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setDone('');
    if (form.newPassword && form.newPassword !== form.confirmPassword) {
      setError('La confirmation du nouveau mot de passe ne correspond pas.');
      return;
    }
    setSaving(true);
    try {
      const body = { username: form.username.trim(), email: form.email.trim() || null };
      if (canReceive) {
        body.notify_expiry = !!form.notify_expiry;
        body.notify_expiry_days = parseInt(form.notify_expiry_days, 10) || 7;
        body.notify_expiry_hour = parseInt(form.notify_expiry_hour, 10) || 0;
      }
      if (form.newPassword) {
        body.currentPassword = form.currentPassword;
        body.newPassword = form.newPassword;
      }
      const updated = await api.put('/auth/profile', body);
      updateUser({
        ...user,
        username: updated.username,
        email: updated.email,
        notify_expiry: updated.notify_expiry,
        notify_expiry_days: updated.notify_expiry_days,
        notify_expiry_hour: updated.notify_expiry_hour
      });
      setForm((f) => ({ ...f, currentPassword: '', newPassword: '', confirmPassword: '' }));
      setDone('Profil mis à jour.');
      setTimeout(onClose, 1200);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function start2fa() {
    setMsg2fa('');
    setError('');
    setBusy2fa(true);
    try {
      const res = await api.post('/auth/2fa/setup');
      setSetup(res);
      setCode2fa('');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy2fa(false);
    }
  }

  async function confirm2fa() {
    setMsg2fa('');
    setError('');
    setBusy2fa(true);
    try {
      await api.post('/auth/2fa/enable', { code: code2fa });
      setTotpEnabled(true);
      setSetup(null);
      setCode2fa('');
      setMsg2fa('Double authentification activée.');
      updateUser({ ...user, totp_enabled: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy2fa(false);
    }
  }

  async function disable2fa() {
    setMsg2fa('');
    setError('');
    setBusy2fa(true);
    try {
      await api.post('/auth/2fa/disable', { code: code2fa });
      setTotpEnabled(false);
      setSetup(null);
      setCode2fa('');
      setMsg2fa('Double authentification désactivée.');
      updateUser({ ...user, totp_enabled: false });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy2fa(false);
    }
  }

  async function handleSendNow() {
    setError('');
    setDone('');
    setSendingNow(true);
    try {
      const res = await api.post('/auth/profile/send-expiry');
      if (res.sent === 0) setDone(res.notice || 'Aucun contrat à signaler.');
      else setDone(`Rappel envoyé (${res.count} contrat(s) sur ${res.days} jours).`);
    } catch (err) {
      setError(err.message);
    } finally {
      setSendingNow(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Mon profil</h3>
          <button className="close-btn" onClick={onClose}><X size={20} /></button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {error && <div className="error-banner full">{error}</div>}
            <div className="field">
              <label>Nom d'utilisateur</label>
              <input
                type="text"
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
              />
            </div>
            <div className="field">
              <label>Email</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="nom@entreprise.com"
              />
            </div>
            <div className="field">
              <label>Mot de passe actuel <span className="field-hint">(pour changer le mot de passe)</span></label>
              <input
                type="password"
                value={form.currentPassword}
                onChange={(e) => setForm({ ...form, currentPassword: e.target.value })}
                autoComplete="current-password"
              />
            </div>
            <div className="field">
              <label>Nouveau mot de passe <span className="field-hint">(6 caractères min.)</span></label>
              <input
                type="password"
                value={form.newPassword}
                onChange={(e) => setForm({ ...form, newPassword: e.target.value })}
                autoComplete="new-password"
              />
            </div>
            <div className="field">
              <label>Confirmer le nouveau mot de passe</label>
              <input
                type="password"
                value={form.confirmPassword}
                onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })}
                autoComplete="new-password"
              />
            </div>
            {canReceive && (
              <>
                <hr className="profile-sep" />
                <div className="profile-section-title">Notifications des échéances</div>
                <div className="field field-check">
                  <label className="check-label">
                    <input
                      type="checkbox"
                      checked={!!form.notify_expiry}
                      onChange={(e) => setForm({ ...form, notify_expiry: e.target.checked })}
                    />
                    Recevoir les rappels automatiques des contrats qui expirent
                  </label>
                  <span className="field-hint">Un email liste les contrats arrivant à échéance.</span>
                </div>
                <div className="form-row">
                  <div className="field">
                    <label>Nombre de jours avant expiration</label>
                    <input
                      type="number"
                      min="1"
                      max="365"
                      value={form.notify_expiry_days}
                      onChange={(e) => setForm({ ...form, notify_expiry_days: e.target.value })}
                    />
                  </div>
                  <div className="field">
                    <label>Heure d'envoi quotidienne (0-23)</label>
                    <input
                      type="number"
                      min="0"
                      max="23"
                      value={form.notify_expiry_hour}
                      onChange={(e) => setForm({ ...form, notify_expiry_hour: e.target.value })}
                    />
                  </div>
                </div>
                <div className="field">
                  <button
                    type="button"
                    className="btn"
                    onClick={handleSendNow}
                    disabled={sendingNow}
                    title="M'envoyer immédiatement le rappel des contrats expirant selon mon délai"
                  >
                    <Send size={14} /> {sendingNow ? <span className="spinner" /> : 'Envoyer le rappel maintenant'}
                  </button>
                </div>
              </>
            )}
            <hr className="profile-sep" />
            <div className="profile-section-title">Double authentification (optionnel)</div>
            <div className="field full">
              {msg2fa && <div className="success-banner" style={{ marginBottom: 10 }}>{msg2fa}</div>}
              {totpEnabled ? (
                <>
                  <p className="field-hint">
                    La double authentification est <strong>activée</strong> sur votre compte. À chaque
                    connexion, un code de votre application d'authentification sera demandé.
                  </p>
                  <div className="form-row" style={{ alignItems: 'flex-end' }}>
                    <div className="field">
                      <label>Code de vérification (pour désactiver)</label>
                      <input
                        type="text"
                        inputMode="numeric"
                        maxLength={6}
                        value={code2fa}
                        onChange={(e) => setCode2fa(e.target.value.replace(/\D/g, ''))}
                      />
                    </div>
                    <div className="field">
                      <button type="button" className="btn" onClick={disable2fa} disabled={busy2fa || code2fa.length < 6}>
                        {busy2fa ? <span className="spinner" /> : 'Désactiver'}
                      </button>
                    </div>
                  </div>
                </>
              ) : setup ? (
                <>
                  <p className="field-hint">
                    Scannez ce QR code avec votre application d'authentification (Bitwarden,
                    Google/Microsoft Authenticator, Duo Mobile…), puis saisissez le code affiché.
                  </p>
                  {setup.qr && <img className="qr-2fa" src={setup.qr} alt="QR code de configuration" />}
                  <p className="field-hint" style={{ textAlign: 'center' }}>
                    Saisie manuelle : <code>{setup.secret}</code>
                  </p>
                  <div className="form-row" style={{ alignItems: 'flex-end' }}>
                    <div className="field">
                      <label>Code affiché par l'application</label>
                      <input
                        type="text"
                        inputMode="numeric"
                        maxLength={6}
                        value={code2fa}
                        onChange={(e) => setCode2fa(e.target.value.replace(/\D/g, ''))}
                        autoFocus
                      />
                    </div>
                    <div className="field">
                      <button type="button" className="btn btn-primary" onClick={confirm2fa} disabled={busy2fa || code2fa.length < 6}>
                        {busy2fa ? <span className="spinner" /> : 'Activer'}
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <p className="field-hint">
                    Protégez votre compte avec une application d'authentification (Bitwarden,
                    Google/Microsoft Authenticator, Duo Mobile…). Cette protection reste facultative.
                  </p>
                  <button type="button" className="btn" onClick={start2fa} disabled={busy2fa}>
                    <ShieldCheck size={14} /> {busy2fa ? <span className="spinner" /> : 'Activer la double authentification'}
                  </button>
                </>
              )}
            </div>
            {done && <div className="success-banner full">{done}</div>}
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Annuler</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? <span className="spinner" /> : 'Enregistrer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}