const express = require('express');
const db = require('../db');
const { hashPassword } = require('../services/auth');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();

const DEFAULT_PASSWORD = 'Vecino2026'; // contraseña inicial compartida

// ─── Helpers ────────────────────────────────────────────
function validateUserPayload({ name, email, apartment_id }, { requireApartment = true } = {}) {
  if (typeof name !== 'string' || name.trim().length < 2) {
    return 'name requerido (mín. 2 caracteres)';
  }
  if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return 'email inválido';
  }
  if (requireApartment) {
    if (!Number.isInteger(apartment_id) || apartment_id <= 0) {
      return 'apartment_id inválido';
    }
  }
  return null;
}

// ─── LISTAR RESIDENTES + DEPTOS ─────────────────────────
router.get('/', requireAdmin, (req, res) => {
  const residents = db.prepare(`
    SELECT u.id, u.email, u.name, u.phone, u.active, u.must_change_password,
           u.apartment_id, a.number AS apartment_number, a.floor
    FROM users u
    LEFT JOIN apartments a ON a.id = u.apartment_id
    WHERE u.role = 'resident'
    ORDER BY a.floor ASC, a.number ASC
  `).all();

  const apartments = db.prepare(`
    SELECT a.id, a.number, a.floor, a.active,
           u.id AS resident_id, u.name AS resident_name, u.email AS resident_email,
           u.active AS resident_active
    FROM apartments a
    LEFT JOIN users u ON u.apartment_id = a.id AND u.role = 'resident'
    ORDER BY a.floor ASC, a.number ASC
  `).all();

  res.json({ residents, apartments });
});

// ─── CREAR RESIDENTE ────────────────────────────────────
router.post('/', requireAdmin, async (req, res) => {
  const { name, email, phone = null, apartment_id, password = DEFAULT_PASSWORD } = req.body || {};
  const err = validateUserPayload({ name, email, apartment_id });
  if (err) return res.status(400).json({ error: err });

  if (typeof password !== 'string' || password.length < 8) {
    return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres' });
  }

  const cleanEmail = email.toLowerCase().trim();

  // ¿Ya existe ese email?
  if (db.prepare('SELECT id FROM users WHERE email = ?').get(cleanEmail)) {
    return res.status(409).json({ error: 'Ya existe un usuario con ese email' });
  }

  // ¿El depto existe y está libre?
  const apt = db.prepare('SELECT id FROM apartments WHERE id = ?').get(apartment_id);
  if (!apt) return res.status(404).json({ error: 'Departamento no encontrado' });

  const alreadyHasResident = db.prepare(
    "SELECT id FROM users WHERE apartment_id = ? AND role = 'resident'"
  ).get(apartment_id);
  if (alreadyHasResident) {
    return res.status(409).json({ error: 'Ese departamento ya tiene un residente asignado' });
  }

  const hash = await hashPassword(password);
  const createResident = db.transaction(() => {
    const info = db.prepare(`
      INSERT INTO users (email, password_hash, name, phone, role, apartment_id, must_change_password)
      VALUES (?, ?, ?, ?, 'resident', ?, 1)
    `).run(cleanEmail, hash, name.trim(), phone?.trim() || null, apartment_id);

    db.prepare('UPDATE apartments SET active = 1 WHERE id = ?').run(apartment_id);
    return info;
  });
  const info = createResident();

  const user = db.prepare(`
    SELECT u.id, u.email, u.name, u.phone, u.active, u.must_change_password,
           u.apartment_id, a.number AS apartment_number
    FROM users u
    LEFT JOIN apartments a ON a.id = u.apartment_id
    WHERE u.id = ?
  `).get(info.lastInsertRowid);

  res.status(201).json({
    user,
    initial_password: password,
    note: 'El residente deberá cambiar la contraseña en su primer login.',
  });
});

// ─── ACTUALIZAR ESTADO DEL DEPARTAMENTO ─────────────────
router.patch('/apartments/:id', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'id inválido' });
  }

  const active = req.body?.active;
  if (active !== 0 && active !== 1) {
    return res.status(400).json({ error: 'active debe ser 0 o 1' });
  }

  const apartment = db.prepare('SELECT id FROM apartments WHERE id = ?').get(id);
  if (!apartment) return res.status(404).json({ error: 'Departamento no encontrado' });

  db.prepare('UPDATE apartments SET active = ? WHERE id = ?').run(active, id);
  res.json({ apartment: { id, active } });
});

// ─── ACTUALIZAR RESIDENTE ───────────────────────────────
router.patch('/:id', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'id inválido' });

  const user = db.prepare(
    "SELECT * FROM users WHERE id = ? AND role = 'resident'"
  ).get(id);
  if (!user) return res.status(404).json({ error: 'Residente no encontrado' });

  const name = req.body?.name ?? user.name;
  const phone = req.body?.phone !== undefined ? req.body.phone : user.phone;
  const active = req.body?.active !== undefined ? Number(req.body.active) : user.active;

  const err = validateUserPayload({ name, email: user.email, apartment_id: user.apartment_id });
  if (err) return res.status(400).json({ error: err });

  db.prepare('UPDATE users SET name = ?, phone = ?, active = ? WHERE id = ?')
    .run(name.trim(), phone?.trim() || null, active ? 1 : 0, id);

  const updated = db.prepare(`
    SELECT u.id, u.email, u.name, u.phone, u.active, u.must_change_password,
           u.apartment_id, a.number AS apartment_number
    FROM users u
    LEFT JOIN apartments a ON a.id = u.apartment_id
    WHERE u.id = ?
  `).get(id);

  res.json({ user: updated });
});

// ─── RESETEAR CONTRASEÑA ────────────────────────────────
router.post('/:id/reset-password', requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'id inválido' });

  const { password = DEFAULT_PASSWORD } = req.body || {};
  if (typeof password !== 'string' || password.length < 8) {
    return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres' });
  }

  const user = db.prepare(
    "SELECT id FROM users WHERE id = ? AND role = 'resident'"
  ).get(id);
  if (!user) return res.status(404).json({ error: 'Residente no encontrado' });

  const hash = await hashPassword(password);
  db.prepare('UPDATE users SET password_hash = ?, must_change_password = 1 WHERE id = ?')
    .run(hash, id);

  res.json({
    ok: true,
    temporary_password: password,
    note: 'El residente deberá cambiar la contraseña en su próximo login.',
  });
});

// ─── BORRAR RESIDENTE ───────────────────────────────────
router.delete('/:id', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'id inválido' });

  const user = db.prepare(
    "SELECT id, apartment_id FROM users WHERE id = ? AND role = 'resident'"
  ).get(id);
  if (!user) return res.status(404).json({ error: 'Residente no encontrado' });

  // ¿Tiene pagos registrados? Entonces no se puede borrar (por historial).
  const hasPayments = db.prepare(
    'SELECT COUNT(*) AS c FROM payments WHERE apartment_id = (SELECT apartment_id FROM users WHERE id = ?)'
  ).get(id).c;
  if (hasPayments > 0) {
    return res.status(409).json({
      error: 'No se puede borrar: el residente tiene pagos registrados. Desactiva su cuenta en su lugar.',
    });
  }

  const deleteResident = db.transaction(() => {
    db.prepare('DELETE FROM users WHERE id = ?').run(id);
    const remainingResident = db.prepare(
      "SELECT id FROM users WHERE apartment_id = ? AND role = 'resident' LIMIT 1"
    ).get(user.apartment_id);
    if (!remainingResident) {
      db.prepare('UPDATE apartments SET active = 0 WHERE id = ?').run(user.apartment_id);
    }
  });
  deleteResident();
  res.json({ ok: true });
});

module.exports = router;