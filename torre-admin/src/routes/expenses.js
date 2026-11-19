const express = require('express');
const db = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// ─── Helpers ────────────────────────────────────────────
async function recalcPeriodTotal(periodId) {
  const rows = await db.sql(
    'SELECT COALESCE(SUM(amount_cents), 0) AS total FROM expenses WHERE period_id = ?',
    periodId
  );
  const total = rows[0]?.total || 0;
  await db.sql('UPDATE periods SET total_expenses_cents = ? WHERE id = ?', total, periodId);
  return total;
}

async function getOpenPeriodOr404(periodId, res) {
  const rows = await db.sql('SELECT * FROM periods WHERE id = ?', periodId);
  const period = rows[0];
  if (!period) {
    res.status(404).json({ error: 'Período no encontrado' });
    return null;
  }
  if (period.status === 'closed') {
    res.status(409).json({ error: 'El período está cerrado; no se puede modificar' });
    return null;
  }
  return period;
}

function validateExpensePayload({ concept, amount_cents, date }) {
  if (typeof concept !== 'string' || concept.trim().length < 2) {
    return 'concept requerido (mín. 2 caracteres)';
  }
  if (!Number.isInteger(amount_cents) || amount_cents <= 0) {
    return 'amount_cents debe ser un entero > 0 (en centavos)';
  }
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return 'date debe tener formato YYYY-MM-DD';
  }
  return null;
}

// ─── LISTAR gastos de un período ────────────────────────
router.get('/periods/:periodId/expenses', requireAdmin, async (req, res) => {
  try {
    const periodId = Number(req.params.periodId);
    if (!Number.isInteger(periodId)) return res.status(400).json({ error: 'periodId inválido' });

    const periods = await db.sql('SELECT id FROM periods WHERE id = ?', periodId);
    if (!periods || periods.length === 0) return res.status(404).json({ error: 'Período no encontrado' });

    const expenses = await db.sql(`
      SELECT id, concept, category, amount_cents, date, receipt_url, created_at
      FROM expenses
      WHERE period_id = ?
      ORDER BY date ASC, id ASC
    `, periodId);

    const total = expenses.reduce((s, e) => s + e.amount_cents, 0);
    res.json({ expenses, total_cents: total, count: expenses.length });
  } catch (err) {
    console.error('GET expenses error:', err);
    res.status(500).json({ error: 'Error al listar gastos' });
  }
});

// ─── CREAR gasto ────────────────────────────────────────
router.post('/periods/:periodId/expenses', requireAdmin, async (req, res) => {
  try {
    const periodId = Number(req.params.periodId);
    if (!Number.isInteger(periodId)) return res.status(400).json({ error: 'periodId inválido' });

    const period = await getOpenPeriodOr404(periodId, res);
    if (!period) return;

    const { concept, amount_cents, date, category = null, receipt_url = null } = req.body || {};
    const err = validateExpensePayload({ concept, amount_cents, date });
    if (err) return res.status(400).json({ error: err });

    await db.sql(`
      INSERT INTO expenses (period_id, concept, category, amount_cents, date, receipt_url, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, periodId, concept.trim(), category, amount_cents, date, receipt_url, req.user.id);

    const newTotal = await recalcPeriodTotal(periodId);
    const inserted = await db.sql(
      `SELECT * FROM expenses
       WHERE period_id = ? AND concept = ? AND amount_cents = ? AND date = ?
       ORDER BY id DESC LIMIT 1`,
      periodId, concept.trim(), amount_cents, date
    );

    res.status(201).json({
      expense: inserted[0],
      period_total_cents: newTotal,
    });
  } catch (err) {
    console.error('POST expenses error:', err);
    res.status(500).json({ error: 'Error al crear el gasto' });
  }
});

// ─── ACTUALIZAR gasto ───────────────────────────────────
router.patch('/expenses/:id', requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'id inválido' });

    const rows = await db.sql('SELECT * FROM expenses WHERE id = ?', id);
    const expense = rows[0];
    if (!expense) return res.status(404).json({ error: 'Gasto no encontrado' });

    const period = await getOpenPeriodOr404(expense.period_id, res);
    if (!period) return;

    const concept     = req.body?.concept     ?? expense.concept;
    const amount_cents = req.body?.amount_cents ?? expense.amount_cents;
    const date        = req.body?.date        ?? expense.date;
    const category    = req.body?.category    ?? expense.category;
    const receipt_url = req.body?.receipt_url ?? expense.receipt_url;

    const err = validateExpensePayload({ concept, amount_cents, date });
    if (err) return res.status(400).json({ error: err });

    await db.sql(`
      UPDATE expenses
      SET concept = ?, category = ?, amount_cents = ?, date = ?, receipt_url = ?
      WHERE id = ?
    `, concept.trim(), category, amount_cents, date, receipt_url, id);

    const newTotal = await recalcPeriodTotal(expense.period_id);
    const updatedRows = await db.sql('SELECT * FROM expenses WHERE id = ?', id);

    res.json({ expense: updatedRows[0], period_total_cents: newTotal });
  } catch (err) {
    console.error('PATCH expenses error:', err);
    res.status(500).json({ error: 'Error al actualizar el gasto' });
  }
});

// ─── BORRAR gasto ───────────────────────────────────────
router.delete('/expenses/:id', requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'id inválido' });

    const rows = await db.sql('SELECT * FROM expenses WHERE id = ?', id);
    const expense = rows[0];
    if (!expense) return res.status(404).json({ error: 'Gasto no encontrado' });

    const period = await getOpenPeriodOr404(expense.period_id, res);
    if (!period) return;

    await db.sql('DELETE FROM expenses WHERE id = ?', id);
    const newTotal = await recalcPeriodTotal(expense.period_id);

    res.json({ ok: true, period_total_cents: newTotal });
  } catch (err) {
    console.error('DELETE expenses error:', err);
    res.status(500).json({ error: 'Error al borrar el gasto' });
  }
});

module.exports = router;