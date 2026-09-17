import React, { createContext, useContext, useState, useEffect } from 'react';
import { Navigate, Routes, Route, useLocation } from 'react-router-dom';
import { getStoredUser, clearSession, api } from './api';
import { AppearanceContext, DEFAULT_APPEARANCE, normalizeAppearance, applyAppearance } from './appearance.js';
import Login from './pages/Login.jsx';
import ResetPassword from './pages/ResetPassword.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Contrats from './pages/Contrats.jsx';
import Users from './pages/Users.jsx';
import Settings from './pages/Settings.jsx';
import Backup from './pages/Backup.jsx';
import Appearance from './pages/Appearance.jsx';
import Layout from './components/Layout.jsx';

const AuthContext = createContext(null);

export function useAuth() {
  return useContext(AuthContext);
}

function RequireAdmin({ children }) {
  const { user } = useAuth();
  const location = useLocation();
  if (user?.role !== 'admin') {
    return <Navigate to="/" replace state={{ from: location }} />;
  }
  return children;
}

export default function App() {
  const [user, setUser] = useState(getStoredUser());
  const [appearance, setAppearance] = useState(DEFAULT_APPEARANCE);

  useEffect(() => {
    if (!user) return;
    api.get('/appearance')
      .then((data) => {
        const a = normalizeAppearance(data);
        applyAppearance(a);
        setAppearance(a);
      })
      .catch(() => {});
  }, [user]);

  const updateAppearance = (a) => {
    const n = normalizeAppearance(a);
    applyAppearance(n);
    setAppearance(n);
  };

  const login = (u) => setUser(u);
  const logout = () => {
    clearSession();
    setUser(null);
  };
  const updateUser = (u) => {
    setUser(u);
    localStorage.setItem('user', JSON.stringify(u));
  };

  if (!user) {
    return (
      <AuthContext.Provider value={{ user, login, logout, updateUser }}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/reset" element={<ResetPassword />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </AuthContext.Provider>
    );
  }

  return (
    <AuthContext.Provider value={{ user, login, logout, updateUser }}>
      <AppearanceContext.Provider value={{ appearance, updateAppearance }}>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/contrats" element={<Contrats />} />
            <Route path="/users" element={<RequireAdmin><Users /></RequireAdmin>} />
            <Route path="/settings" element={<RequireAdmin><Settings /></RequireAdmin>} />
            <Route path="/appearance" element={<RequireAdmin><Appearance /></RequireAdmin>} />
            <Route path="/backup" element={<RequireAdmin><Backup /></RequireAdmin>} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AppearanceContext.Provider>
    </AuthContext.Provider>
  );
}