const express = require('express');
const db = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { notify, notifyAdmins } = require('../services/notifications');

const router = express.Router();

// ─── Helpers ────────────────────────────────────────────
async function recalcChargeStatus(periodId, apartmentId) {
  const chargeRows = await db.sql(
    'SELECT * FROM charges WHERE period_id = ? AND apartment_id = ?',
    periodId,
    apartmentId
  );
  const charge = chargeRows[0];
  if (!charge) return null;

  const paidRows = await db.sql(
    `SELECT COALESCE(SUM(amount_cents), 0) AS paid
     FROM payments
     WHERE period_id = ? AND apartment_id = ? AND status = 'approved'`,
    periodId,
    apartmentId
  );
  const paid = paidRows[0]?.paid || 0;

  const newStatus = paid >= charge.amount_cents ? 'paid' : 'pending';
  if (newStatus !== charge.status) {
    await db.sql('UPDATE charges SET status = ? WHERE id = ?', newStatus, charge.id);
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
router.get('/', requireAuth, async (req, res) => {
  try {
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

    const rows = await db.sql(`
      SELECT p.*, a.number AS apartment_number,
             pe.year AS period_year, pe.month AS period_month
      FROM payments p
      JOIN apartments a ON a.id = p.apartment_id
      JOIN periods pe ON pe.id = p.period_id
      ${where}
      ORDER BY p.date DESC, p.id DESC
    `, ...params);

    res.json({ payments: rows, count: rows.length });
  } catch (err) {
    console.error('GET /payments error:', err);
    res.status(500).json({ error: 'Error al listar pagos' });
  }
});

// ─── MIS PERÍODOS (vista del residente) ─────────────────
router.get('/my-account', requireAuth, async (req, res) => {
  try {
    if (!req.user.apartment_id) {
      return res.status(403).json({ error: 'Usuario sin departamento asignado' });
    }
    const apartmentId = req.user.apartment_id;

    const rows = await db.sql(`
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
    `, apartmentId, apartmentId, apartmentId);

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
  } catch (err) {
    console.error('GET /my-account error:', err);
    res.status(500).json({ error: 'Error al cargar tu cuenta' });
  }
});

// ─── ESTADO DE CUENTA de un depto en un período ─────────
router.get('/account/:apartmentId/period/:periodId', requireAuth, async (req, res) => {
  try {
    const apartmentId = Number(req.params.apartmentId);
    const periodId = Number(req.params.periodId);
    if (!Number.isInteger(apartmentId) || !Number.isInteger(periodId)) {
      return res.status(400).json({ error: 'ids inválidos' });
    }

    if (req.user.role !== 'admin' && req.user.apartment_id !== apartmentId) {
      return res.status(403).json({ error: 'No autorizado' });
    }

    const apartments = await db.sql('SELECT * FROM apartments WHERE id = ?', apartmentId);
    const apartment = apartments[0];
    if (!apartment) return res.status(404).json({ error: 'Departamento no encontrado' });

    const periods = await db.sql('SELECT * FROM periods WHERE id = ?', periodId);
    const period = periods[0];
    if (!period) return res.status(404).json({ error: 'Período no encontrado' });

    const charges = await db.sql(
      'SELECT * FROM charges WHERE period_id = ? AND apartment_id = ?',
      periodId,
      apartmentId
    );
    const charge = charges[0];

    if (!charge) {
      return res.json({
        apartment, period, charge: null, payments: [],
        paid_cents: 0, balance_cents: 0, note: 'Sin cuota generada para este período',
      });
    }

    const payments = await db.sql(`
      SELECT id, amount_cents, method, notes, proof_url, status, date, reviewed_at, created_at
      FROM payments
      WHERE period_id = ? AND apartment_id = ?
      ORDER BY date ASC, id ASC
    `, periodId, apartmentId);

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
  } catch (err) {
    console.error('GET /account error:', err);
    res.status(500).json({ error: 'Error al cargar el estado de cuenta' });
  }
});

// ─── CREAR pago (residente o admin) ─────────────────────
router.post('/', requireAuth, async (req, res) => {
  try {
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

    const aptRows = await db.sql('SELECT id, number FROM apartments WHERE id = ?', apartment_id);
    const apt = aptRows[0];
    if (!apt) return res.status(404).json({ error: 'Departamento no encontrado' });

    const periodRows = await db.sql('SELECT * FROM periods WHERE id = ?', period_id);
    const period = periodRows[0];
    if (!period) return res.status(404).json({ error: 'Período no encontrado' });
    if (period.status !== 'closed') {
      return res.status(409).json({ error: 'El período está abierto; no se puede pagar aún' });
    }

    const chargeRows = await db.sql(
      'SELECT id FROM charges WHERE period_id = ? AND apartment_id = ?',
      period_id,
      apartment_id
    );
    if (!chargeRows || chargeRows.length === 0) {
      return res.status(409).json({ error: 'No hay cuota para este depto en ese período' });
    }

    const isAdmin = req.user.role === 'admin';
    const paymentMethod = isAdmin ? (method || 'manual') : method;

    // INSERT
    await db.sql(
      `INSERT INTO payments
        (apartment_id, period_id, amount_cents, method, notes, proof_url, date, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      apartment_id,
      period_id,
      amount_cents,
      paymentMethod,
      notes,
      proof_url,
      date,
      isAdmin ? 'approved' : 'pending'
    );

    // Obtener el payment recién insertado
    const insertedRows = await db.sql(
      `SELECT * FROM payments
       WHERE apartment_id = ? AND period_id = ? AND amount_cents = ? AND date = ?
       ORDER BY id DESC LIMIT 1`,
      apartment_id,
      period_id,
      amount_cents,
      date
    );
    const payment = insertedRows[0];

    // Si es admin, marcar reviewed_by y recalcular charge
    if (isAdmin) {
      await db.sql(
        `UPDATE payments SET reviewed_by = ?, reviewed_at = datetime('now') WHERE id = ?`,
        req.user.id,
        payment.id
      );
      await recalcChargeStatus(period_id, apartment_id);
    }

    // Notificaciones (fire and forget)
    if (isAdmin) {
      const residentRows = await db.sql(
        "SELECT id FROM users WHERE apartment_id = ? AND role = 'resident' AND active = 1 LIMIT 1",
        apartment_id
      );
      const resident = residentRows[0];
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

    // Devolver el payment actualizado
    const finalRows = await db.sql('SELECT * FROM payments WHERE id = ?', payment.id);
    res.status(201).json({ payment: finalRows[0] });
  } catch (err) {
    console.error('POST /payments error:', err);
    res.status(500).json({ error: 'Error al crear el pago' });
  }
});

// ─── APROBAR / RECHAZAR (solo admin) ────────────────────
router.patch('/:id/review', requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'id inválido' });

    const { action } = req.body || {};
    if (!['approve', 'reject'].includes(action)) {
      return res.status(400).json({ error: "action debe ser 'approve' o 'reject'" });
    }

    const paymentRows = await db.sql('SELECT * FROM payments WHERE id = ?', id);
    const payment = paymentRows[0];
    if (!payment) return res.status(404).json({ error: 'Pago no encontrado' });
    if (payment.status !== 'pending') {
      return res.status(409).json({ error: 'Solo se pueden revisar pagos pendientes' });
    }

    const newStatus = action === 'approve' ? 'approved' : 'rejected';

    await db.sql(
      "UPDATE payments SET status = ?, reviewed_by = ?, reviewed_at = datetime('now') WHERE id = ?",
      newStatus,
      req.user.id,
      id
    );

    const result = await recalcChargeStatus(payment.period_id, payment.apartment_id);

    const updatedRows = await db.sql('SELECT * FROM payments WHERE id = ?', id);
    const updated = updatedRows[0];

    // Notificar al residente
    const residentRows = await db.sql(
      "SELECT id FROM users WHERE apartment_id = ? AND role = 'resident' AND active = 1 LIMIT 1",
      payment.apartment_id
    );
    const resident = residentRows[0];

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

    res.json({ payment: updated, charge: result?.charge ?? null, paid_cents: result?.paid_cents ?? 0 });
  } catch (err) {
    console.error('PATCH /payments/:id/review error:', err);
    res.status(500).json({ error: 'Error al revisar el pago' });
  }
});

// ─── BORRAR pago (solo si está pendiente o rechazado) ───
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'id inválido' });

    const paymentRows = await db.sql('SELECT * FROM payments WHERE id = ?', id);
    const payment = paymentRows[0];
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

    await db.sql('DELETE FROM payments WHERE id = ?', id);
    const result = await recalcChargeStatus(payment.period_id, payment.apartment_id);

    res.json({ ok: true, charge: result?.charge ?? null });
  } catch (err) {
    console.error('DELETE /payments/:id error:', err);
    res.status(500).json({ error: 'Error al borrar el pago' });
  }
});

module.exports = router;