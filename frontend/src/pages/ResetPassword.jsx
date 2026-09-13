import React, { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';

export default function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get('token') || '';

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (password.length < 6) {
      setError('Le mot de passe doit faire au moins 6 caractères.');
      return;
    }
    if (password !== confirm) {
      setError('Les deux mots de passe ne correspondent pas.');
      return;
    }
    setLoading(true);
    try {
      await api.post('/auth/reset-password', { token, newPassword: password });
      setDone(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-wrap">
      <div className="login-card">
        <div className="logo">✆</div>
        {done ? (
          <>
            <h1>Mot de passe mis à jour</h1>
            <p style={{ textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
              Vous pouvez maintenant vous connecter avec votre nouveau mot de passe.
            </p>
            <Link to="/login" className="btn btn-primary btn-block" style={{ marginTop: 16, textDecoration: 'none' }}>
              Se connecter
            </Link>
          </>
        ) : (
          <>
            <h1>Définir mon mot de passe</h1>
            <p style={{ textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
              Choisissez un nouveau mot de passe (6 caractères minimum).
            </p>
            {error && <div className="error-banner">{error}</div>}
            <form onSubmit={handleSubmit}>
              <div className="field">
                <label>Nouveau mot de passe</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoFocus
                  autoComplete="new-password"
                />
              </div>
              <div className="field">
                <label>Confirmer le mot de passe</label>
                <input
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  autoComplete="new-password"
                />
              </div>
              <button className="btn btn-primary btn-block" disabled={loading}>
                {loading ? <span className="spinner" /> : 'Enregistrer'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}