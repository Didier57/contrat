import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import { Plus, Pencil, Trash2, X, Activity, UserX, UserCheck } from 'lucide-react';

const EMPTY = { username: '', email: '', password: '', role: 'lecteur' };

const CAT_NAMES = {
  login: 'Connexions',
  user: 'Utilisateurs',
  profile: 'Profils',
  contract: 'Contrats',
  import: 'Imports',
  settings: 'Paramètres',
  backup: 'Sauvegarde',
  general: 'Divers'
};

export default function Users() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [me, setMe] = useState(null);

  const [editing, setEditing] = useState(null); // null | {} création | {id,...} édition
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [confirmToggle, setConfirmToggle] = useState(null); // utilisateur à désactiver
  const [toast, setToast] = useState('');
  const [tempPass, setTempPass] = useState(null); // mot de passe provisoire si l'email n'a pas pu partir

  // Journal d'activité
  const [logs, setLogs] = useState([]);
  const [logsLoading, setLogsLoading] = useState(true);
  const [logError, setLogError] = useState('');
  const [metaUsers, setMetaUsers] = useState([]);
  const [metaCategories, setMetaCategories] = useState([]);
  const [userFilter, setUserFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');

  function showToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(''), 2500);
  }

  async function load() {
    setLoading(true);
    try {
      const data = await api.get('/users');
      setUsers(data);
      setError('');
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    api.get('/auth/me').then(setMe).catch(() => {});
    api.get('/activity/meta').then((meta) => {
      setMetaUsers(meta.users || []);
      setMetaCategories(meta.categories || []);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLogsLoading(true);
    setLogError('');
    const params = new URLSearchParams();
    params.set('limit', '200');
    if (userFilter) params.set('user', userFilter);
    if (categoryFilter) params.set('category', categoryFilter);
    api.get(`/activity?${params.toString()}`)
      .then((data) => { if (!cancelled) setLogs(data || []); })
      .catch((e) => { if (!cancelled) setLogError(e.message); })
      .finally(() => { if (!cancelled) setLogsLoading(false); });
    return () => { cancelled = true; };
  }, [userFilter, categoryFilter]);

  function openCreate() {
    setForm(EMPTY);
    setEditing({});
  }

  function openEdit(u) {
    setForm({ username: u.username, email: u.email || '', password: '', role: u.role });
    setEditing(u);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!form.username.trim()) {
      setError('Le nom d\'utilisateur est obligatoire.');
      return;
    }
    if (!editing.id && !form.email.trim()) {
      setError('Une adresse email est obligatoire (envoi de l\'invitation).');
      return;
    }
    setSaving(true);
    try {
      if (editing.id) {
        const payload = { role: form.role, email: form.email.trim() || null };
        if (form.password) payload.password = form.password;
        await api.put(`/users/${editing.id}`, payload);
        showToast('Utilisateur modifié');
        setEditing(null);
        load();
      } else {
        const res = await api.post('/users', {
          username: form.username.trim(),
          email: form.email.trim(),
          role: form.role
        });
        if (res.emailSent) {
          showToast('Utilisateur créé — email d\'invitation envoyé');
        } else {
          setTempPass(res.temporaryPassword || 'mot de passe non fourni');
          showToast('Utilisateur créé — envoi d\'email impossible');
        }
        setEditing(null);
        load();
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  function openConfirmDelete(u) {
    if (me && me.id === u.id) {
      showToast('Vous ne pouvez pas supprimer votre propre compte.');
      return;
    }
    setConfirmDelete(u);
  }

  async function handleDelete() {
    if (!confirmDelete) return;
    setDeleting(true);
    try {
      await api.del(`/users/${confirmDelete.id}`);
      setConfirmDelete(null);
      showToast('Utilisateur supprimé');
      load();
    } catch (err) {
      setConfirmDelete(null);
      showToast(err.message);
    } finally {
      setDeleting(false);
    }
  }

  async function handleToggle(u, active) {
    setSaving(true);
    setError('');
    try {
      await api.put(`/users/${u.id}`, { active });
      setConfirmToggle(null);
      showToast(active ? 'Compte activé' : 'Compte désactivé');
      load();
    } catch (err) {
      setConfirmToggle(null);
      showToast(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Utilisateurs</h2>
          <div className="sub">Gestion des comptes et permissions</div>
        </div>
        <button className="btn btn-primary btn-sm" onClick={openCreate}>
          <Plus size={15} /> Nouvel utilisateur
        </button>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="table-wrap">
        {loading ? (
          <div className="empty-state"><span className="spinner" /></div>
        ) : users.length === 0 ? (
          <div className="empty-state">Aucun utilisateur</div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: 40 }}>ID</th>
                <th>Nom d'utilisateur</th>
                <th>Email</th>
                <th style={{ width: 140 }}>Rôle</th>
                <th style={{ width: 90 }}>Statut</th>
                <th style={{ width: 140 }}>Créé le</th>
                <th style={{ width: 150 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className={u.active === 1 ? '' : 'cell-muted'}>
                  <td>{u.id}</td>
                  <td><b>{u.username}</b>{me && me.id === u.id ? <span className="badge badge-blue" style={{ marginLeft: 8 }}>vous</span> : null}</td>
                  <td>{u.email || '—'}</td>
                  <td>
                    {u.role === 'admin'
                      ? <span className="badge badge-blue">Admin</span>
                      : u.role === 'editeur'
                        ? <span className="badge badge-green">Éditeur</span>
                        : <span className="badge badge-gray">Lecteur</span>}
                  </td>
                  <td>
                    {u.active === 1
                      ? <span className="badge badge-green">Actif</span>
                      : <span className="badge badge-red">Inactif</span>}
                  </td>
                  <td>{u.created_at ? u.created_at.slice(0, 10) : '—'}</td>
                  <td className="row-actions">
                    <button className="btn btn-xs btn-ghost" onClick={() => openEdit(u)} title="Modifier"><Pencil size={13} /></button>
                    {u.active === 1 ? (
                      me && me.id === u.id ? (
                        <button className="btn btn-xs btn-ghost" disabled title="Vous ne pouvez pas désactiver votre propre compte"><UserX size={13} /></button>
                      ) : (
                        <button className="btn btn-xs btn-danger-ghost" onClick={() => setConfirmToggle(u)} title="Désactiver le compte"><UserX size={13} /></button>
                      )
                    ) : (
                      <button className="btn btn-xs btn-ghost" onClick={() => handleToggle(u, 1)} title="Réactiver le compte"><UserCheck size={13} /></button>
                    )}
                    <button className="btn btn-xs btn-danger" onClick={() => openConfirmDelete(u)} title="Supprimer"><Trash2 size={13} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {editing && (
        <div className="modal-overlay" onClick={() => setEditing(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{editing.id ? 'Modifier l\'utilisateur' : 'Nouvel utilisateur'}</h3>
              <button className="close-btn" onClick={() => setEditing(null)}><X size={20} /></button>
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
                    disabled={!!editing.id}
                  />
                </div>
                <div className="field">
                  <label>Rôle</label>
                  <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                    <option value="lecteur">Lecteur</option>
                    <option value="editeur">Éditeur</option>
                    <option value="admin">Administrateur</option>
                  </select>
                </div>
                <div className="field">
                  <label>Email {!editing.id && <span className="field-hint">(obligatoire — invitation par email)</span>}</label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    placeholder="nom@entreprise.com"
                  />
                </div>
                {editing.id ? (
                  <div className="field">
                    <label>Mot de passe <span className="field-hint">(laisser vide pour ne pas changer)</span></label>
                    <input
                      type="password"
                      value={form.password}
                      onChange={(e) => setForm({ ...form, password: e.target.value })}
                      autoComplete="new-password"
                    />
                  </div>
                ) : (
                  <div className="field-hint" style={{ marginBottom: 16 }}>
                    À la création, un mot de passe est généré automatiquement et l'utilisateur reçoit un
                    email avec un lien pour définir le sien.
                  </div>
                )}
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setEditing(null)}>Annuler</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? <span className="spinner" /> : 'Enregistrer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {tempPass && (
        <div className="modal-overlay" onClick={() => setTempPass(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Compte créé sans envoi d'email</h3>
              <button className="close-btn" onClick={() => setTempPass(null)}><X size={20} /></button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: 13, marginBottom: 12 }}>
                L'email d'invitation n'a pas pu partir (SMTP non configuré ou erreur).
                Communiquez ce mot de passe provisoire à l'utilisateur — il devra le modifier dès sa connexion.
              </p>
              <div className="temp-pass-box">{tempPass}</div>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-primary" onClick={() => setTempPass(null)}>OK</button>
            </div>
          </div>
        </div>
      )}

      {confirmDelete && (
        <ConfirmDialog
          title="Supprimer cet utilisateur ?"
          message={`Le compte « ${confirmDelete.username} » (${confirmDelete.role === 'admin' ? 'administrateur' : confirmDelete.role === 'editeur' ? 'éditeur' : 'lecteur'}) sera définitivement supprimé.`}
          onCancel={() => setConfirmDelete(null)}
          onConfirm={handleDelete}
          loading={deleting}
        />
      )}

      {confirmToggle && (
        <ConfirmDialog
          title="Désactiver cet utilisateur ?"
          message={`Le compte « ${confirmToggle.username} » ne pourra plus se connecter (il reste consultable et pourra être réactivé).`}
          onCancel={() => setConfirmToggle(null)}
          onConfirm={() => handleToggle(confirmToggle, 0)}
          loading={saving}
          confirmLabel="Désactiver"
        />
      )}

      <section className="panel" style={{ marginTop: 24 }}>
        <div className="panel-title">
          <Activity size={16} /> Journal d'activité
          <span className="field-hint">connexions, modifications, suppressions, imports… (200 dernières entrées)</span>
        </div>
        <div className="toolbar">
          <select value={userFilter} onChange={(e) => setUserFilter(e.target.value)}>
            <option value="">Tous les utilisateurs</option>
            {metaUsers.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
          <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
            <option value="">Toutes les catégories</option>
            {metaCategories.map((c) => <option key={c} value={c}>{CAT_NAMES[c] || c}</option>)}
          </select>
        </div>
        <div className="table-wrap">
          {logsLoading ? (
            <div className="empty-state"><span className="spinner" /></div>
          ) : logError ? (
            <div className="error-banner">{logError}</div>
          ) : logs.length === 0 ? (
            <div className="empty-state">Aucune activité enregistrée.</div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: 150 }}>Date</th>
                  <th style={{ width: 130 }}>Utilisateur</th>
                  <th style={{ width: 110 }}>Catégorie</th>
                  <th style={{ width: 220 }}>Action</th>
                  <th>Cible / détail</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((l) => (
                  <tr key={l.id} className={l.category === 'login' && l.action.startsWith('Échec') ? 'cell-red' : ''}>
                    <td className="nowrap">{l.created_at ? l.created_at.slice(0, 16) : '—'}</td>
                    <td>{l.username || '—'}</td>
                    <td><span className="badge badge-gray">{CAT_NAMES[l.category] || l.category}</span></td>
                    <td className="nowrap">{l.action}</td>
                    <td>
                      {l.target ? <b>{l.target}</b> : null}
                      {l.detail ? <span className="field-hint"> — {l.detail}</span> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}