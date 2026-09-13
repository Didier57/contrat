import React, { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { LayoutDashboard, FileSignature, UserCog, Settings, UserCircle, LogOut, DatabaseBackup } from 'lucide-react';
import { useAuth } from '../App.jsx';
import ProfileModal from './ProfileModal.jsx';

export default function Layout() {
  const { user, logout } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [profileOpen, setProfileOpen] = useState(false);

  return (
    <div className="layout">
      <header className="topbar">
        <div className="topbar-brand">
          <span role="img" aria-label="logo">📝</span> Contrats
        </div>
        <nav className="topbar-nav">
          <NavLink to="/" end>
            <LayoutDashboard size={16} /> Dashboard
          </NavLink>
          <NavLink to="/contrats">
            <FileSignature size={16} /> Contrats
          </NavLink>
          {isAdmin && (
            <NavLink to="/users">
              <UserCog size={16} /> Utilisateurs
            </NavLink>
          )}
          {isAdmin && (
            <NavLink to="/settings">
              <Settings size={16} /> Paramètres
            </NavLink>
          )}
          {isAdmin && (
            <NavLink to="/backup">
              <DatabaseBackup size={16} /> Sauvegarde
            </NavLink>
          )}
        </nav>
        <div className="topbar-user">
          <span className="topbar-role">{user?.role === 'admin' ? 'Administrateur' : 'Lecteur'}</span>
          <span className="topbar-name">{user?.username}</span>
          <button className="btn btn-xs" onClick={() => setProfileOpen(true)} title="Mon profil">
            <UserCircle size={13} /> Profil
          </button>
          <button className="btn btn-xs" onClick={logout} title="Déconnexion">
            <LogOut size={13} /> Quitter
          </button>
        </div>
      </header>
      <main className="main">
        <Outlet />
      </main>
      {profileOpen && <ProfileModal onClose={() => setProfileOpen(false)} />}
    </div>
  );
}