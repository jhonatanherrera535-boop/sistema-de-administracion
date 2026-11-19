const express = require('express');
const db = require('../db');
const { hashPassword } = require('../services/auth');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();

const DEFAULT_PASSWORD = 'Vecino2026';

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
router.get('/', requireAdmin, async (req, res) => {
  try {
    const residents = await db.sql(`
      SELECT u.id, u.email, u.name, u.phone, u.active, u.must_change_password,
             u.apartment_id, a.number AS apartment_number, a.floor
      FROM users u
      LEFT JOIN apartments a ON a.id = u.apartment_id
      WHERE u.role = 'resident'
      ORDER BY a.floor ASC, a.number ASC
    `);

    const apartments = await db.sql(`
      SELECT a.id, a.number, a.floor, a.active,
             u.id AS resident_id, u.name AS resident_name, u.email AS resident_email,
             u.active AS resident_active
      FROM apartments a
      LEFT JOIN users u ON u.apartment_id = a.id AND u.role = 'resident'
      ORDER BY a.floor ASC, a.number ASC
    `);

    res.json({ residents, apartments });
  } catch (err) {
    console.error('GET /users error:', err);
    res.status(500).json({ error: 'Error al cargar residentes' });
  }
});

// ─── CREAR RESIDENTE ────────────────────────────────────
router.post('/', requireAdmin, async (req, res) => {
  try {
    const { name, email, phone = null, apartment_id, password = DEFAULT_PASSWORD } = req.body || {};
    const err = validateUserPayload({ name, email, apartment_id });
    if (err) return res.status(400).json({ error: err });

    if (typeof password !== 'string' || password.length < 8) {
      return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres' });
    }

    const cleanEmail = email.toLowerCase().trim();

    // ¿Ya existe ese email?
    const existing = await db.sql('SELECT id FROM users WHERE email = ?', cleanEmail);
    if (existing && existing.length > 0) {
      return res.status(409).json({ error: 'Ya existe un usuario con ese email' });
    }

    // ¿El depto existe?
    const aptRows = await db.sql('SELECT id, active FROM apartments WHERE id = ?', apartment_id);
    if (!aptRows || aptRows.length === 0) {
      return res.status(404).json({ error: 'Departamento no encontrado' });
    }

    // ¿Ya tiene residente?
    const alreadyHasResident = await db.sql(
      "SELECT id FROM users WHERE apartment_id = ? AND role = 'resident'",
      apartment_id
    );
    if (alreadyHasResident && alreadyHasResident.length > 0) {
      return res.status(409).json({ error: 'Ese departamento ya tiene un residente asignado' });
    }

    const hash = await hashPassword(password);

    // Insertar user
    await db.sql(
      `INSERT INTO users (email, password_hash, name, phone, role, apartment_id, must_change_password)
       VALUES (?, ?, ?, ?, 'resident', ?, 1)`,
      cleanEmail, hash, name.trim(), phone?.trim() || null, apartment_id
    );

    // Activar depto automáticamente (si tiene residente, participa del reparto)
    await db.sql('UPDATE apartments SET active = 1 WHERE id = ?', apartment_id);

    // Devolver el user creado
    const userRows = await db.sql(
      `SELECT u.id, u.email, u.name, u.phone, u.active, u.must_change_password,
              u.apartment_id, a.number AS apartment_number
       FROM users u
       LEFT JOIN apartments a ON a.id = u.apartment_id
       WHERE u.email = ?`,
      cleanEmail
    );

    res.status(201).json({
      user: userRows[0],
      initial_password: password,
      note: 'El residente deberá cambiar la contraseña en su primer login.',
    });
  } catch (err) {
    console.error('POST /users error:', err);
    res.status(500).json({ error: 'Error al crear el residente' });
  }
});

// ─── ACTIVAR / DESACTIVAR DEPARTAMENTO ──────────────────
router.patch('/apartments/:id', requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'id inválido' });
    }

    const active = req.body?.active;
    if (active !== 0 && active !== 1) {
      return res.status(400).json({ error: 'active debe ser 0 o 1' });
    }

    const rows = await db.sql('SELECT id FROM apartments WHERE id = ?', id);
    if (!rows || rows.length === 0) {
      return res.status(404).json({ error: 'Departamento no encontrado' });
    }

    await db.sql('UPDATE apartments SET active = ? WHERE id = ?', active, id);
    res.json({ apartment: { id, active } });
  } catch (err) {
    console.error('PATCH /apartments/:id error:', err);
    res.status(500).json({ error: 'Error al actualizar el departamento' });
  }
});

// ─── ACTUALIZAR RESIDENTE ───────────────────────────────
router.patch('/:id', requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'id inválido' });

    const rows = await db.sql(
      "SELECT * FROM users WHERE id = ? AND role = 'resident'",
      id
    );
    if (!rows || rows.length === 0) {
      return res.status(404).json({ error: 'Residente no encontrado' });
    }
    const user = rows[0];

    const name = req.body?.name ?? user.name;
    const phone = req.body?.phone !== undefined ? req.body.phone : user.phone;
    const active = req.body?.active !== undefined ? Number(req.body.active) : user.active;

    const err = validateUserPayload({ name, email: user.email, apartment_id: user.apartment_id });
    if (err) return res.status(400).json({ error: err });

    await db.sql(
      'UPDATE users SET name = ?, phone = ?, active = ? WHERE id = ?',
      name.trim(), phone?.trim() || null, active ? 1 : 0, id
    );

    const updatedRows = await db.sql(
      `SELECT u.id, u.email, u.name, u.phone, u.active, u.must_change_password,
              u.apartment_id, a.number AS apartment_number
       FROM users u
       LEFT JOIN apartments a ON a.id = u.apartment_id
       WHERE u.id = ?`,
      id
    );

    res.json({ user: updatedRows[0] });
  } catch (err) {
    console.error('PATCH /users/:id error:', err);
    res.status(500).json({ error: 'Error al actualizar el residente' });
  }
});

// ─── RESETEAR CONTRASEÑA ────────────────────────────────
router.post('/:id/reset-password', requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'id inválido' });

    const { password = DEFAULT_PASSWORD } = req.body || {};
    if (typeof password !== 'string' || password.length < 8) {
      return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres' });
    }

    const rows = await db.sql(
      "SELECT id FROM users WHERE id = ? AND role = 'resident'",
      id
    );
    if (!rows || rows.length === 0) {
      return res.status(404).json({ error: 'Residente no encontrado' });
    }

    const hash = await hashPassword(password);
    await db.sql(
      'UPDATE users SET password_hash = ?, must_change_password = 1 WHERE id = ?',
      hash, id
    );

    res.json({
      ok: true,
      temporary_password: password,
      note: 'El residente deberá cambiar la contraseña en su próximo login.',
    });
  } catch (err) {
    console.error('POST /users/:id/reset-password error:', err);
    res.status(500).json({ error: 'Error al resetear la contraseña' });
  }
});

// ─── BORRAR RESIDENTE ───────────────────────────────────
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'id inválido' });

    const rows = await db.sql(
      "SELECT id, apartment_id FROM users WHERE id = ? AND role = 'resident'",
      id
    );
    if (!rows || rows.length === 0) {
      return res.status(404).json({ error: 'Residente no encontrado' });
    }
    const user = rows[0];

    // ¿Tiene pagos registrados?
    const payRows = await db.sql(
      'SELECT COUNT(*) AS c FROM payments WHERE apartment_id = ?',
      user.apartment_id
    );
    const hasPayments = payRows[0]?.c || 0;
    if (hasPayments > 0) {
      return res.status(409).json({
        error: 'No se puede borrar: el residente tiene pagos registrados. Desactiva su cuenta en su lugar.',
      });
    }

    await db.sql('DELETE FROM users WHERE id = ?', id);

    // Si el depto quedó sin residente, desactivarlo
    const remaining = await db.sql(
      "SELECT id FROM users WHERE apartment_id = ? AND role = 'resident' LIMIT 1",
      user.apartment_id
    );
    if (!remaining || remaining.length === 0) {
      await db.sql('UPDATE apartments SET active = 0 WHERE id = ?', user.apartment_id);
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /users/:id error:', err);
    res.status(500).json({ error: 'Error al borrar el residente' });
  }
});

module.exports = router;