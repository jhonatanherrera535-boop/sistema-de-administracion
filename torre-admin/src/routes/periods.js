const express = require('express');
const db = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth, requireAdmin); // todas las rutas requieren admin por ahora

const VALID_MODES = new Set(['none', 'percent', 'fixed']);

function validatePayload({ year, month, reserve_mode, reserve_value }) {
  if (!Number.isInteger(year) || year < 2000 || year > 2100) return 'year inválido';
  if (!Number.isInteger(month) || month < 1 || month > 12) return 'month inválido (1-12)';
  if (reserve_mode !== undefined && !VALID_MODES.has(reserve_mode)) {
    return "reserve_mode debe ser 'none', 'percent' o 'fixed'";
  }
  if (reserve_value !== undefined) {
    if (!Number.isInteger(reserve_value) || reserve_value < 0) {
      return 'reserve_value debe ser un entero >= 0';
    }
    if (reserve_mode === 'percent' && reserve_value > 100) {
      return 'reserve_value como porcentaje no puede pasar de 100';
    }
  }
  return null;
}

// LISTAR todos los períodos
router.get('/', (req, res) => {
  const rows = db.prepare(`
    SELECT id, year, month, status, reserve_mode, reserve_value,
           total_expenses_cents, reserve_contribution_cents,
           charge_per_apartment_cents, active_apartments_count, closed_at
    FROM periods
    ORDER BY year DESC, month DESC
  `).all();
  res.json({ periods: rows });
});

// CREAR período
router.post('/', (req, res) => {
  const { year, month, reserve_mode = 'none', reserve_value = 0 } = req.body || {};
  const err = validatePayload({ year, month, reserve_mode, reserve_value });
  if (err) return res.status(400).json({ error: err });

  try {
    const info = db.prepare(`
      INSERT INTO periods (year, month, reserve_mode, reserve_value)
      VALUES (?, ?, ?, ?)
    `).run(year, month, reserve_mode, reserve_value);

    const period = db.prepare('SELECT * FROM periods WHERE id = ?').get(info.lastInsertRowid);
    res.status(201).json({ period });
  } catch (e) {
    if (String(e.code).includes('CONSTRAINT')) {
      return res.status(409).json({
        error: `Ya existe el período ${year}-${String(month).padStart(2, '0')}`,
      });
    }
    console.error(e);
    res.status(500).json({ error: 'Error interno' });
  }
});

// DETALLE de un período
router.get('/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'id inválido' });

  const period = db.prepare('SELECT * FROM periods WHERE id = ?').get(id);
  if (!period) return res.status(404).json({ error: 'Período no encontrado' });

  const expenses = db.prepare(`
    SELECT * FROM expenses WHERE period_id = ? ORDER BY date ASC, id ASC
  `).all(id);

  const chargesCount = db.prepare(
    'SELECT COUNT(*) AS c FROM charges WHERE period_id = ?'
  ).get(id).c;

  res.json({ period, expenses, charges_count: chargesCount });
});

// ACTUALIZAR configuración de fondo (solo si el período está abierto)
router.patch('/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'id inválido' });

  const period = db.prepare('SELECT * FROM periods WHERE id = ?').get(id);
  if (!period) return res.status(404).json({ error: 'Período no encontrado' });
  if (period.status === 'closed') {
    return res.status(409).json({ error: 'El período está cerrado; no se puede editar' });
  }

  const newMode = req.body?.reserve_mode ?? period.reserve_mode;
  const newValue = req.body?.reserve_value ?? period.reserve_value;

  const err = validatePayload({
    year: period.year,
    month: period.month,
    reserve_mode: newMode,
    reserve_value: newValue,
  });
  if (err) return res.status(400).json({ error: err });

  db.prepare('UPDATE periods SET reserve_mode = ?, reserve_value = ? WHERE id = ?')
    .run(newMode, newValue, id);

  const updated = db.prepare('SELECT * FROM periods WHERE id = ?').get(id);
  res.json({ period: updated });
});


// ────────────────────────────────────────────────────────
// CIERRE DE PERÍODO — calcula y genera cuotas
// ────────────────────────────────────────────────────────
router.post('/:id/close', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'id inválido' });

  const period = db.prepare('SELECT * FROM periods WHERE id = ?').get(id);
  if (!period) return res.status(404).json({ error: 'Período no encontrado' });
  if (period.status === 'closed') {
    return res.status(409).json({ error: 'El período ya está cerrado' });
  }

  // 1) Gastos (recalculados en vivo, por si hay drift)
  const { total } = db.prepare(
    'SELECT COALESCE(SUM(amount_cents), 0) AS total FROM expenses WHERE period_id = ?'
  ).get(id);
  if (total <= 0) {
    return res.status(400).json({ error: 'No hay gastos registrados; no se puede cerrar' });
  }

  // 2) Deptos activos
  const activeApts = db
    .prepare('SELECT id FROM apartments WHERE active = 1 ORDER BY id ASC')
    .all();
  const n = activeApts.length;
  if (n === 0) {
    return res.status(400).json({ error: 'No hay departamentos activos' });
  }

  // 3) Aporte al fondo
  let reserveContribution = 0;
  if (period.reserve_mode === 'percent') {
    reserveContribution = Math.round((total * period.reserve_value) / 100);
  } else if (period.reserve_mode === 'fixed') {
    reserveContribution = period.reserve_value * n;
  }

  // 4) Reparto con manejo de centavos sobrantes
  const amountToDistribute = total + reserveContribution;
  const base = Math.floor(amountToDistribute / n);
  const remainder = amountToDistribute - base * n; // 0..n-1 centavos

  // 5) Transacción
  const closeTxn = db.transaction(() => {
    db.prepare('DELETE FROM charges WHERE period_id = ?').run(id);

    const insertCharge = db.prepare(
      'INSERT INTO charges (period_id, apartment_id, amount_cents) VALUES (?, ?, ?)'
    );
    activeApts.forEach((apt, idx) => {
      const amount = base + (idx < remainder ? 1 : 0);
      insertCharge.run(id, apt.id, amount);
    });

    if (reserveContribution > 0) {
      const label = `${period.year}-${String(period.month).padStart(2, '0')}`;
      db.prepare(`
        INSERT INTO fund_movements (period_id, type, amount_cents, description, date, created_by)
        VALUES (?, 'contribution', ?, ?, date('now'), ?)
      `).run(id, reserveContribution, `Aporte fondo ${label}`, req.user.id);
    }

    db.prepare(`
      UPDATE periods
      SET status = 'closed',
          total_expenses_cents = ?,
          reserve_contribution_cents = ?,
          charge_per_apartment_cents = ?,
          active_apartments_count = ?,
          closed_at = datetime('now')
      WHERE id = ?
    `).run(total, reserveContribution, base, n, id);
  });

  try {
    closeTxn();
    const updated = db.prepare('SELECT * FROM periods WHERE id = ?').get(id);
    const charges = db.prepare(
      'SELECT COUNT(*) AS c FROM charges WHERE period_id = ?'
    ).get(id).c;

    res.json({
      ok: true,
      period: updated,
      breakdown: {
        total_expenses_cents: total,
        reserve_mode: period.reserve_mode,
        reserve_value: period.reserve_value,
        reserve_contribution_cents: reserveContribution,
        amount_to_distribute_cents: amountToDistribute,
        active_apartments: n,
        base_cents: base,
        remainder_cents: remainder,
        charges_created: charges,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al cerrar el período' });
  }
});

// ────────────────────────────────────────────────────────
// LISTAR CUOTAS DE UN PERÍODO
// ────────────────────────────────────────────────────────
router.get('/:id/charges', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'id inválido' });

  const period = db.prepare('SELECT * FROM periods WHERE id = ?').get(id);
  if (!period) return res.status(404).json({ error: 'Período no encontrado' });

  const charges = db.prepare(`
    SELECT c.id, c.amount_cents, c.status,
           a.id AS apartment_id, a.number AS apartment_number, a.floor,
           COALESCE((
             SELECT SUM(p.amount_cents) FROM payments p
             WHERE p.period_id = c.period_id AND p.apartment_id = c.apartment_id
               AND p.status = 'approved'
           ), 0) AS paid_cents,
           COALESCE((
             SELECT SUM(p.amount_cents) FROM payments p
             WHERE p.period_id = c.period_id AND p.apartment_id = c.apartment_id
               AND p.status = 'pending'
           ), 0) AS pending_cents
    FROM charges c
    JOIN apartments a ON a.id = c.apartment_id
    WHERE c.period_id = ?
    ORDER BY a.floor ASC, a.number ASC
  `).all(id);

  const totalBilled = charges.reduce((sum, charge) => sum + charge.amount_cents, 0);
  const totalPaid = charges.reduce((sum, charge) => sum + charge.paid_cents, 0);
  const totalPending = charges.reduce((sum, charge) => sum + charge.pending_cents, 0);
  const paidCount = charges.filter((charge) => charge.status === 'paid').length;
  res.json({
    period_id: id,
    status: period.status,
    charges,
    count: charges.length,
    sum_cents: totalBilled,
    summary: {
      total_billed_cents: totalBilled,
      total_paid_cents: totalPaid,
      total_pending_cents: totalPending,
      total_remaining_cents: totalBilled - totalPaid,
      paid_count: paidCount,
      pending_count: charges.length - paidCount,
    },
  });
});

// ────────────────────────────────────────────────────────
// REABRIR PERÍODO (corrección, borra cuotas y aporte)
// ────────────────────────────────────────────────────────
router.post('/:id/reopen', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'id inválido' });

  const period = db.prepare('SELECT * FROM periods WHERE id = ?').get(id);
  if (!period) return res.status(404).json({ error: 'Período no encontrado' });
  if (period.status === 'open') {
    return res.status(400).json({ error: 'El período ya está abierto' });
  }

  const paymentsCount = db.prepare(
    'SELECT COUNT(*) AS c FROM payments WHERE period_id = ?'
  ).get(id).c;
  if (paymentsCount > 0) {
    return res.status(409).json({
      error: 'Hay pagos registrados en este período; no se puede reabrir',
    });
  }

  const reopenTxn = db.transaction(() => {
    db.prepare('DELETE FROM charges WHERE period_id = ?').run(id);
    db.prepare(
      "DELETE FROM fund_movements WHERE period_id = ? AND type = 'contribution'"
    ).run(id);
    db.prepare(`
      UPDATE periods
      SET status = 'open',
          reserve_contribution_cents = 0,
          charge_per_apartment_cents = 0,
          active_apartments_count = 0,
          closed_at = NULL
      WHERE id = ?
    `).run(id);
  });

  try {
    reopenTxn();
    const updated = db.prepare('SELECT * FROM periods WHERE id = ?').get(id);
    res.json({ ok: true, period: updated });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al reabrir el período' });
  }
});

module.exports = router;