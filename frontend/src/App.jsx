import React, { createContext, useContext, useState } from 'react';
import { Navigate, Routes, Route, useLocation } from 'react-router-dom';
import { getStoredUser, clearSession } from './api';
import Login from './pages/Login.jsx';
import ResetPassword from './pages/ResetPassword.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Contrats from './pages/Contrats.jsx';
import Users from './pages/Users.jsx';
import Settings from './pages/Settings.jsx';
import Backup from './pages/Backup.jsx';
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
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/contrats" element={<Contrats />} />
          <Route path="/users" element={<RequireAdmin><Users /></RequireAdmin>} />
          <Route path="/settings" element={<RequireAdmin><Settings /></RequireAdmin>} />
          <Route path="/backup" element={<RequireAdmin><Backup /></RequireAdmin>} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthContext.Provider>
  );
}