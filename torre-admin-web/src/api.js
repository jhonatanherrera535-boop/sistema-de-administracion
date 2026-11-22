// En desarrollo local, usa el proxy de Vite; en producción, la URL del backend.
const API_ORIGIN = (
  import.meta.env.VITE_API_URL ||
  (import.meta.env.DEV ? '' : 'https://sistema-de-administracion.onrender.com')
).replace(/\/+$/, '');
const API_BASE = API_ORIGIN ? `${API_ORIGIN}/api` : '/api';

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

// Para URLs de archivos (comprobantes, etc.)
export const assetUrl = (path) => {
  if (!path) return null;
  if (path.startsWith('http')) return path;
  // En producción, antepone el origen del backend
  return API_ORIGIN ? `${API_ORIGIN}${path}` : path;
};