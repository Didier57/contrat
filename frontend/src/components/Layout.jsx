import React, { useState, useEffect } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { LayoutDashboard, FileSignature, UserCog, Settings, UserCircle, LogOut, DatabaseBackup, Sun, Moon } from 'lucide-react';
import { useAuth } from '../App.jsx';
import ProfileModal from './ProfileModal.jsx';

const THEME_KEY = 'contrat-theme';

export default function Layout() {
  const { user, logout } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [profileOpen, setProfileOpen] = useState(false);
  const [theme, setTheme] = useState(() => (localStorage.getItem(THEME_KEY) === 'dark' ? 'dark' : 'light'));

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

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
          <button
            className="btn btn-xs theme-toggle"
            onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
            title={theme === 'dark' ? 'Passer en mode clair' : 'Passer en mode sombre'}
            aria-label={theme === 'dark' ? 'Passer en mode clair' : 'Passer en mode sombre'}
          >
            {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
          </button>
          <span className="topbar-role">{user?.role === 'admin' ? 'Administrateur' : user?.role === 'editeur' ? 'Éditeur' : 'Lecteur'}</span>
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