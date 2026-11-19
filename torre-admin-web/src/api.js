const API_BASE = '/api';

async function request(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const msg = data.error || `Error ${res.status}`;
    throw new Error(msg);
  }
  return data;
}

export const api = {
  get:    (path) => request(path),
  post:   (path, body) => request(path, { method: 'POST',   body: JSON.stringify(body) }),
  patch:  (path, body) => request(path, { method: 'PATCH',  body: JSON.stringify(body) }),
  delete: (path) => request(path, { method: 'DELETE' }),

  upload: async (file) => {
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch(`${API_BASE}/uploads`, {
      method: 'POST',
      credentials: 'include',
      body: formData,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Error al subir');
    return data;
  },
};

// El navegador resolverá las rutas relativas contra el origen actual.
export const assetUrl = (path) => {
  if (!path) return null;
  if (path.startsWith('http')) return path;
  return path; // El navegador lo resolverá contra el origen actual (el proxy de Vite)
};