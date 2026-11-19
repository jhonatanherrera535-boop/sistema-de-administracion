const express = require('express');
const db = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { notify, notifyAdmins } = require('../services/notifications');

const router = express.Router();

// ─── Helpers ────────────────────────────────────────────
function recalcChargeStatus(periodId, apartmentId) {
  const charge = db.prepare(
    'SELECT * FROM charges WHERE period_id = ? AND apartment_id = ?'
  ).get(periodId, apartmentId);
  if (!charge) return null;

  const { paid } = db.prepare(`
    SELECT COALESCE(SUM(amount_cents), 0) AS paid
    FROM payments
    WHERE period_id = ? AND apartment_id = ? AND status = 'approved'
  `).get(periodId, apartmentId);

  const newStatus = paid >= charge.amount_cents ? 'paid' : 'pending';
  if (newStatus !== charge.status) {
    db.prepare('UPDATE charges SET status = ? WHERE id = ?').run(newStatus, charge.id);
  }
  return { charge: { ...charge, status: newStatus }, paid_cents: paid };
}

function validatePayment({ amount_cents, date, method, notes }) {
  if (!Number.isInteger(amount_cents) || amount_cents <= 0) {
    return 'amount_cents debe ser un entero > 0 (en centavos)';
  }
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return 'date debe tener formato YYYY-MM-DD';
  }
  if (method !== undefined && method !== null && typeof method !== 'string') {
    return 'method debe ser texto';
  }
  if (notes !== undefined && notes !== null && typeof notes !== 'string') {
    return 'notes debe ser texto';
  }
  return null;
}

// ─── LISTAR pagos ───────────────────────────────────────
// - residente: solo los suyos
// - admin: todos (filtros opcionales: ?period_id=&apartment_id=&status=)
router.get('/', requireAuth, (req, res) => {
  const isAdmin = req.user.role === 'admin';
  const { period_id, apartment_id, status } = req.query;

  const filters = [];
  const params = [];

  if (!isAdmin) {
    if (!req.user.apartment_id) {
      return res.status(403).json({ error: 'Usuario sin departamento asignado' });
    }
    filters.push('p.apartment_id = ?');
    params.push(req.user.apartment_id);
  } else if (apartment_id) {
    filters.push('p.apartment_id = ?');
    params.push(Number(apartment_id));
  }

  if (period_id) { filters.push('p.period_id = ?'); params.push(Number(period_id)); }
  if (status)    { filters.push('p.status = ?');    params.push(status); }

  const where = filters.length ? 'WHERE ' + filters.join(' AND ') : '';

  const rows = db.prepare(`
    SELECT p.*, a.number AS apartment_number,
           pe.year AS period_year, pe.month AS period_month
    FROM payments p
    JOIN apartments a ON a.id = p.apartment_id
    JOIN periods pe ON pe.id = p.period_id
    ${where}
    ORDER BY p.date DESC, p.id DESC
  `).all(...params);

  res.json({ payments: rows, count: rows.length });
});

// ─── MIS PERÍODOS (vista del residente) ─────────────────
// Devuelve todos los períodos cerrados con el estado de cuenta del residente
router.get('/my-account', requireAuth, (req, res) => {
  if (!req.user.apartment_id) {
    return res.status(403).json({ error: 'Usuario sin departamento asignado' });
  }
  const apartmentId = req.user.apartment_id;

  const rows = db.prepare(`
    SELECT
      pe.id AS period_id, pe.year, pe.month,
      c.id AS charge_id, c.amount_cents AS charge_cents, c.status AS charge_status,
      COALESCE((
        SELECT SUM(p.amount_cents) FROM payments p
        WHERE p.period_id = pe.id AND p.apartment_id = ? AND p.status = 'approved'
      ), 0) AS paid_cents,
      (
        SELECT COUNT(*) FROM payments p
        WHERE p.period_id = pe.id AND p.apartment_id = ? AND p.status = 'pending'
      ) AS pending_payments_count
    FROM periods pe
    JOIN charges c ON c.period_id = pe.id AND c.apartment_id = ?
    WHERE pe.status = 'closed'
    ORDER BY pe.year DESC, pe.month DESC
  `).all(apartmentId, apartmentId, apartmentId);

  const accounts = rows.map((r) => ({
    period_id: r.period_id,
    year: r.year,
    month: r.month,
    charge: {
      id: r.charge_id,
      amount_cents: r.charge_cents,
      status: r.charge_status,
    },
    paid_cents: r.paid_cents,
    balance_cents: Math.max(0, r.charge_cents - r.paid_cents),
    pending_payments_count: r.pending_payments_count,
  }));

  res.json({ accounts });
});

// ─── ESTADO DE CUENTA de un depto en un período ─────────
router.get('/account/:apartmentId/period/:periodId', requireAuth, (req, res) => {
  const apartmentId = Number(req.params.apartmentId);
  const periodId = Number(req.params.periodId);
  if (!Number.isInteger(apartmentId) || !Number.isInteger(periodId)) {
    return res.status(400).json({ error: 'ids inválidos' });
  }

  // Residentes solo pueden consultar su propio depto
  if (req.user.role !== 'admin' && req.user.apartment_id !== apartmentId) {
    return res.status(403).json({ error: 'No autorizado' });
  }

  const apartment = db.prepare('SELECT * FROM apartments WHERE id = ?').get(apartmentId);
  if (!apartment) return res.status(404).json({ error: 'Departamento no encontrado' });

  const period = db.prepare('SELECT * FROM periods WHERE id = ?').get(periodId);
  if (!period) return res.status(404).json({ error: 'Período no encontrado' });

  const charge = db.prepare(
    'SELECT * FROM charges WHERE period_id = ? AND apartment_id = ?'
  ).get(periodId, apartmentId);

  if (!charge) {
    return res.json({
      apartment, period, charge: null, payments: [],
      paid_cents: 0, balance_cents: 0, note: 'Sin cuota generada para este período',
    });
  }

  const payments = db.prepare(`
    SELECT id, amount_cents, method, notes, proof_url, status, date, reviewed_at, created_at
    FROM payments
    WHERE period_id = ? AND apartment_id = ?
    ORDER BY date ASC, id ASC
  `).all(periodId, apartmentId);

  const paid = payments
    .filter((p) => p.status === 'approved')
    .reduce((s, p) => s + p.amount_cents, 0);

  res.json({
    apartment,
    period: {
      id: period.id, year: period.year, month: period.month, status: period.status,
    },
    charge: { id: charge.id, amount_cents: charge.amount_cents, status: charge.status },
    payments,
    paid_cents: paid,
    balance_cents: Math.max(0, charge.amount_cents - paid),
  });
});

// ─── CREAR pago (residente o admin) ─────────────────────
router.post('/', requireAuth, (req, res) => {
  const { amount_cents, date, method = null, notes = null, proof_url = null } = req.body || {};
  const err = validatePayment({ amount_cents, date, method, notes });
  if (err) return res.status(400).json({ error: err });

  let apartment_id;
  if (req.user.role === 'resident') {
    apartment_id = req.user.apartment_id;
    if (!apartment_id) {
      return res.status(403).json({ error: 'Usuario sin departamento asignado' });
    }
  } else {
    apartment_id = Number(req.body?.apartment_id);
    if (!Number.isInteger(apartment_id)) {
      return res.status(400).json({ error: 'apartment_id requerido para admin' });
    }
  }

  const period_id = Number(req.body?.period_id);
  if (!Number.isInteger(period_id)) {
    return res.status(400).json({ error: 'period_id requerido' });
  }

  const apt = db.prepare('SELECT id, number FROM apartments WHERE id = ?').get(apartment_id);
  if (!apt) return res.status(404).json({ error: 'Departamento no encontrado' });

  const period = db.prepare('SELECT * FROM periods WHERE id = ?').get(period_id);
  if (!period) return res.status(404).json({ error: 'Período no encontrado' });
  if (period.status !== 'closed') {
    return res.status(409).json({ error: 'El período está abierto; no se puede pagar aún' });
  }

  const charge = db.prepare(
    'SELECT id FROM charges WHERE period_id = ? AND apartment_id = ?'
  ).get(period_id, apartment_id);
  if (!charge) {
    return res.status(409).json({ error: 'No hay cuota para este depto en ese período' });
  }

  const isAdmin = req.user.role === 'admin';
  const paymentMethod = isAdmin ? (method || 'manual') : method;
  const createTxn = db.transaction(() => {
    const info = db.prepare(`
      INSERT INTO payments
        (apartment_id, period_id, amount_cents, method, notes, proof_url, date)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(apartment_id, period_id, amount_cents, paymentMethod, notes, proof_url, date);

    if (isAdmin) {
      db.prepare(`
        UPDATE payments
        SET status = 'approved', reviewed_by = ?, reviewed_at = datetime('now')
        WHERE id = ?
      `).run(req.user.id, info.lastInsertRowid);
      recalcChargeStatus(period_id, apartment_id);
    }

    return db.prepare('SELECT * FROM payments WHERE id = ?').get(info.lastInsertRowid);
  });
  const payment = createTxn();

  if (isAdmin) {
    const resident = db.prepare(
      "SELECT id FROM users WHERE apartment_id = ? AND role = 'resident' AND active = 1 LIMIT 1"
    ).get(apartment_id);
    if (resident) {
      notify({
        userId: resident.id,
        type: 'payment_approved',
        title: 'Pago registrado',
        body: `El administrador registró tu pago de $${(amount_cents / 100).toFixed(2)}`,
        link: `/resident/periods/${period_id}`,
      }).catch((e) => console.error('notify error:', e));
    }
  } else {
    notifyAdmins({
      type: 'payment_created',
      title: 'Nuevo comprobante de pago',
      body: `Depto ${apt.number} reportó un pago de $${(amount_cents / 100).toFixed(2)}`,
      link: '/admin/payments',
    }).catch((e) => console.error('notify error:', e));
  }

  res.status(201).json({ payment });
});

// ─── APROBAR / RECHAZAR (solo admin) ────────────────────
router.patch('/:id/review', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'id inválido' });

  const { action } = req.body || {};
  if (!['approve', 'reject'].includes(action)) {
    return res.status(400).json({ error: "action debe ser 'approve' o 'reject'" });
  }

  const payment = db.prepare('SELECT * FROM payments WHERE id = ?').get(id);
  if (!payment) return res.status(404).json({ error: 'Pago no encontrado' });
  if (payment.status !== 'pending') {
    return res.status(409).json({ error: 'Solo se pueden revisar pagos pendientes' });
  }

  const newStatus = action === 'approve' ? 'approved' : 'rejected';

  const txn = db.transaction(() => {
    db.prepare(
      "UPDATE payments SET status = ?, reviewed_by = ?, reviewed_at = datetime('now') WHERE id = ?"
    ).run(newStatus, req.user.id, id);
    return recalcChargeStatus(payment.period_id, payment.apartment_id);
  });

  try {
    const result = txn();
    const updated = db.prepare('SELECT * FROM payments WHERE id = ?').get(id);

    // Notificar al residente del depto
    const resident = db.prepare(
      "SELECT id FROM users WHERE apartment_id = ? AND role = 'resident' AND active = 1 LIMIT 1"
    ).get(payment.apartment_id);

    if (resident) {
      notify({
        userId: resident.id,
        type: action === 'approve' ? 'payment_approved' : 'payment_rejected',
        title: action === 'approve' ? 'Pago aprobado' : 'Pago rechazado',
        body: `Tu pago de $${(payment.amount_cents / 100).toFixed(2)} fue ${
          action === 'approve' ? 'aprobado' : 'rechazado'
        }`,
        link: `/resident/periods/${payment.period_id}`,
      }).catch((e) => console.error('notify error:', e));
    }

    res.json({ payment: updated, charge: result.charge, paid_cents: result.paid_cents });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al revisar el pago' });
  }
});

// ─── BORRAR pago (solo si está pendiente o rechazado) ───
router.delete('/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'id inválido' });

  const payment = db.prepare('SELECT * FROM payments WHERE id = ?').get(id);
  if (!payment) return res.status(404).json({ error: 'Pago no encontrado' });

  if (req.user.role !== 'admin') {
    if (payment.apartment_id !== req.user.apartment_id) {
      return res.status(403).json({ error: 'No autorizado' });
    }
    if (payment.status === 'approved') {
      return res.status(409).json({ error: 'No se puede borrar un pago aprobado' });
    }
  } else if (payment.status === 'approved') {
    return res.status(409).json({
      error: 'Rechaza el pago antes de borrarlo (para revertir el estado de la cuota)',
    });
  }

  const txn = db.transaction(() => {
    db.prepare('DELETE FROM payments WHERE id = ?').run(id);
    return recalcChargeStatus(payment.period_id, payment.apartment_id);
  });

  try {
    const result = txn();
    res.json({ ok: true, charge: result?.charge ?? null });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al borrar el pago' });
  }
});

module.exports = router;