const { verifyToken } = require('../services/auth');
const db = require('../db');

const COOKIE_NAME = 'torre_token';

// ─── Autenticación base ─────────────────────────────────
async function authenticate(req) {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) return { error: 'No autenticado', status: 401 };

  const payload = verifyToken(token);
  if (!payload) return { error: 'Token inválido', status: 401 };

  const rows = await db.sql(`
    SELECT u.id, u.email, u.name, u.role, u.apartment_id, u.must_change_password,
           a.number AS apartment_number
    FROM users u
    LEFT JOIN apartments a ON a.id = u.apartment_id
    WHERE u.id = ? AND u.active = 1
  `, payload.sub);

  const user = rows[0];
  if (!user) return { error: 'Usuario no válido', status: 401 };

  req.user = user;
  return { user };
}

// ─── Middleware: requiere estar logueado ────────────────
async function requireAuth(req, res, next) {
  try {
    const r = await authenticate(req);
    if (r.error) return res.status(r.status).json({ error: r.error });
    next();
  } catch (err) {
    console.error('requireAuth error:', err);
    res.status(500).json({ error: 'Error de autenticación' });
  }
}

// ─── Middleware: requiere admin (autosuficiente) ────────
async function requireAdmin(req, res, next) {
  try {
    if (!req.user) {
      const r = await authenticate(req);
      if (r.error) return res.status(r.status).json({ error: r.error });
    }
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Requiere rol admin' });
    }
    next();
  } catch (err) {
    console.error('requireAdmin error:', err);
    res.status(500).json({ error: 'Error de autenticación' });
  }
}

module.exports = { requireAuth, requireAdmin, COOKIE_NAME };