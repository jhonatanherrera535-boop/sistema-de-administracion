const { verifyToken } = require('../services/auth');
const db = require('../db');

const COOKIE_NAME = 'torre_token';

// ─── Autenticación base ─────────────────────────────────
function authenticate(req) {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) return { error: 'No autenticado', status: 401 };

  const payload = verifyToken(token);
  if (!payload) return { error: 'Token inválido', status: 401 };

  const user = db.prepare(`
  SELECT u.id, u.email, u.name, u.role, u.apartment_id, u.must_change_password,
         a.number AS apartment_number
  FROM users u
  LEFT JOIN apartments a ON a.id = u.apartment_id
  WHERE u.id = ? AND u.active = 1
`).get(payload.sub);

  if (!user) return { error: 'Usuario no válido', status: 401 };

  req.user = user;
  return { user };
}

// ─── Middleware: requiere estar logueado ────────────────
function requireAuth(req, res, next) {
  const r = authenticate(req);
  if (r.error) return res.status(r.status).json({ error: r.error });
  next();
}

// ─── Middleware: requiere admin (autosuficiente) ────────
// Funciona aunque no haya pasado por requireAuth antes.
function requireAdmin(req, res, next) {
  if (!req.user) {
    const r = authenticate(req);
    if (r.error) return res.status(r.status).json({ error: r.error });
  }
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Requiere rol admin' });
  }
  next();
}

module.exports = { requireAuth, requireAdmin, COOKIE_NAME };