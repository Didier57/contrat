const API = '/api';

export function getToken() {
  return localStorage.getItem('token');
}

export function setSession(token, user) {
  localStorage.setItem('token', token);
  localStorage.setItem('user', JSON.stringify(user));
}

export function clearSession() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
}

export function getStoredUser() {
  try {
    return JSON.parse(localStorage.getItem('user'));
  } catch {
    return null;
  }
}

async function request(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API}${path}`, { ...options, headers });

  if (res.status === 401) {
    clearSession();
    window.location.href = '/login';
    throw new Error('Session expirée');
  }

  if (!res.ok) {
    let msg = `Erreur ${res.status}`;
    try {
      const body = await res.json();
      if (body.error) msg = body.error;
    } catch { /* ignore */ }
    throw new Error(msg);
  }

  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

export const api = {
  get: (path) => request(path),
  post: (path, body) => request(path, { method: 'POST', body: JSON.stringify(body) }),
  put: (path, body) => request(path, { method: 'PUT', body: JSON.stringify(body) }),
  del: (path) => request(path, { method: 'DELETE' }),
  login: (username, password) => request('/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) }),
  upload: async (path, file) => {
    const fd = new FormData();
    fd.append('file', file);
    const headers = {};
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(`${API}${path}`, { method: 'POST', headers, body: fd });
    if (res.status === 401) {
      clearSession();
      window.location.href = '/login';
      throw new Error('Session expirée');
    }
    if (!res.ok) {
      let msg = `Erreur ${res.status}`;
      try {
        const body = await res.json();
        if (body.error) msg = body.error;
      } catch { /* ignore */ }
      throw new Error(msg);
    }
    return res.text().then((t) => (t ? JSON.parse(t) : null));
  },
  download: async (path, filename) => {
    const headers = {};
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(`${API}${path}`, { headers });
    if (res.status === 401) {
      clearSession();
      window.location.href = '/login';
      throw new Error('Session expirée');
    }
    const disposition = res.headers.get('Content-Disposition') || '';
    const fileMatch = disposition.match(/filename="?([^";]+)"?/);
    const finalName = filename || (fileMatch ? fileMatch[1] : 'download.xlsx');
    if (!res.ok) {
      let msg = `Erreur ${res.status}`;
      try {
        const body = await res.json();
        if (body.error) msg = body.error;
      } catch { /* ignore */ }
      throw new Error(msg);
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = finalName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }
};
