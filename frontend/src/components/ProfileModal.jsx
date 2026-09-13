import React, { useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../App.jsx';
import { X } from 'lucide-react';

export default function ProfileModal({ onClose }) {
  const { user, updateUser } = useAuth();
  const [form, setForm] = useState({
    username: user?.username || '',
    email: user?.email || '',
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState('');

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
      if (form.newPassword) {
        body.currentPassword = form.currentPassword;
        body.newPassword = form.newPassword;
      }
      const updated = await api.put('/auth/profile', body);
      updateUser({ ...user, username: updated.username, email: updated.email });
      setForm((f) => ({ ...f, currentPassword: '', newPassword: '', confirmPassword: '' }));
      setDone('Profil mis à jour.');
      setTimeout(onClose, 1200);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
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