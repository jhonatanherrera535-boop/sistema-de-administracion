const express = require('express');
const db = require('../db');
const { verifyPassword, signToken, hashPassword } = require('../services/auth');
const { requireAuth, COOKIE_NAME } = require('../middleware/auth');

const router = express.Router();

// Configuración de la cookie según el entorno
const isProduction = process.env.NODE_ENV === 'production';
const cookieOptions = {
  httpOnly: true,
  sameSite: isProduction ? 'none' : 'strict',
  secure: isProduction,
  maxAge: 7 * 24 * 60 * 60 * 1000,
};

// ─── LOGIN ──────────────────────────────────────────────
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: 'Faltan email o password' });
    }

    const users = await db.sql(`
      SELECT u.*, a.number AS apartment_number
      FROM users u
      LEFT JOIN apartments a ON a.id = u.apartment_id
      WHERE u.email = ? AND u.active = 1
    `, email.toLowerCase().trim());

    const user = users[0];
    if (!user) return res.status(401).json({ error: 'Credenciales inválidas' });

    if (typeof user.password_hash !== 'string' || !user.password_hash) {
      throw new Error(`User ${user.id} has no password hash`);
    }

    const ok = await verifyPassword(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'Credenciales inválidas' });

    const token = signToken(user);
    res.cookie(COOKIE_NAME, token, cookieOptions);

    res.json({
      ok: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        phone: user.phone,
        role: user.role,
        apartment_id: user.apartment_id,
        apartment_number: user.apartment_number,
        must_change_password: user.must_change_password,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error interno' });
  }
});

// ─── LOGOUT ─────────────────────────────────────────────
router.post('/logout', (req, res) => {
  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    sameSite: isProduction ? 'none' : 'strict',
    secure: isProduction,
  });
  res.json({ ok: true });
});

// ─── CAMBIAR MI PROPIA CONTRASEÑA ───────────────────────
router.patch('/password', requireAuth, async (req, res) => {
  try {
    const { current_password, new_password } = req.body || {};
    if (typeof new_password !== 'string' || new_password.length < 8) {
      return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 8 caracteres' });
    }

    const users = await db.sql('SELECT * FROM users WHERE id = ?', req.user.id);
    const user = users[0];
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

    // Si ya cambió su contraseña alguna vez, exigimos la actual
    if (!user.must_change_password) {
      if (!current_password) {
        return res.status(400).json({ error: 'Debes proporcionar tu contraseña actual' });
      }
      const ok = await verifyPassword(current_password, user.password_hash);
      if (!ok) return res.status(401).json({ error: 'Contraseña actual incorrecta' });
    }

    const hash = await hashPassword(new_password);
    await db.sql(
      'UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?',
      hash,
      user.id
    );

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error interno' });
  }
});

// ─── INFO DEL USUARIO ACTUAL ────────────────────────────
router.get('/me', requireAuth, async (req, res) => {
  try {
    const users = await db.sql(`
      SELECT u.id, u.email, u.name, u.phone, u.role, u.apartment_id,
             u.must_change_password, a.number AS apartment_number
      FROM users u
      LEFT JOIN apartments a ON a.id = u.apartment_id
      WHERE u.id = ?
    `, req.user.id);

    const user = users[0];
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

    res.json({ user });
  } catch (err) {
    console.error('GET /me error:', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

module.exports = router;