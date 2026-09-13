import React, { useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../App.jsx';
import { X, Send } from 'lucide-react';

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