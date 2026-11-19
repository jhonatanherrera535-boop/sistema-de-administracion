const express = require('express');
const db = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();


// ─── Helpers ────────────────────────────────────────────
function recalcPeriodTotal(periodId) {
  const { total } = db
    .prepare('SELECT COALESCE(SUM(amount_cents), 0) AS total FROM expenses WHERE period_id = ?')
    .get(periodId);
  db.prepare('UPDATE periods SET total_expenses_cents = ? WHERE id = ?')
    .run(total, periodId);
  return total;
}

function getOpenPeriodOr404(periodId, res) {
  const period = db.prepare('SELECT * FROM periods WHERE id = ?').get(periodId);
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
router.get('/periods/:periodId/expenses',requireAdmin, (req, res) => {
  const periodId = Number(req.params.periodId);
  if (!Number.isInteger(periodId)) return res.status(400).json({ error: 'periodId inválido' });

  const period = db.prepare('SELECT id FROM periods WHERE id = ?').get(periodId);
  if (!period) return res.status(404).json({ error: 'Período no encontrado' });

  const expenses = db.prepare(`
    SELECT id, concept, category, amount_cents, date, receipt_url, created_at
    FROM expenses
    WHERE period_id = ?
    ORDER BY date ASC, id ASC
  `).all(periodId);

  const total = expenses.reduce((s, e) => s + e.amount_cents, 0);
  res.json({ expenses, total_cents: total, count: expenses.length });
});

// ─── CREAR gasto en un período ──────────────────────────
router.post('/periods/:periodId/expenses', requireAdmin, (req, res) => {
  const periodId = Number(req.params.periodId);
  if (!Number.isInteger(periodId)) return res.status(400).json({ error: 'periodId inválido' });

  const period = getOpenPeriodOr404(periodId, res);
  if (!period) return;

  const { concept, amount_cents, date, category = null, receipt_url = null } = req.body || {};
  const err = validateExpensePayload({ concept, amount_cents, date });
  if (err) return res.status(400).json({ error: err });

  const info = db.prepare(`
    INSERT INTO expenses (period_id, concept, category, amount_cents, date, receipt_url, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(periodId, concept.trim(), category, amount_cents, date, receipt_url, req.user.id);

  const newTotal = recalcPeriodTotal(periodId);
  const expense = db.prepare('SELECT * FROM expenses WHERE id = ?').get(info.lastInsertRowid);

  res.status(201).json({ expense, period_total_cents: newTotal });
});

// ─── ACTUALIZAR gasto ───────────────────────────────────
router.patch('/expenses/:id', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'id inválido' });

  const expense = db.prepare('SELECT * FROM expenses WHERE id = ?').get(id);
  if (!expense) return res.status(404).json({ error: 'Gasto no encontrado' });

  const period = getOpenPeriodOr404(expense.period_id, res);
  if (!period) return;

  const concept     = req.body?.concept     ?? expense.concept;
  const amount_cents = req.body?.amount_cents ?? expense.amount_cents;
  const date        = req.body?.date        ?? expense.date;
  const category    = req.body?.category    ?? expense.category;
  const receipt_url = req.body?.receipt_url ?? expense.receipt_url;

  const err = validateExpensePayload({ concept, amount_cents, date });
  if (err) return res.status(400).json({ error: err });

  db.prepare(`
    UPDATE expenses
    SET concept = ?, category = ?, amount_cents = ?, date = ?, receipt_url = ?
    WHERE id = ?
  `).run(concept.trim(), category, amount_cents, date, receipt_url, id);

  const newTotal = recalcPeriodTotal(expense.period_id);
  const updated = db.prepare('SELECT * FROM expenses WHERE id = ?').get(id);

  res.json({ expense: updated, period_total_cents: newTotal });
});

// ─── BORRAR gasto ───────────────────────────────────────
router.delete('/expenses/:id', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'id inválido' });

  const expense = db.prepare('SELECT * FROM expenses WHERE id = ?').get(id);
  if (!expense) return res.status(404).json({ error: 'Gasto no encontrado' });

  const period = getOpenPeriodOr404(expense.period_id, res);
  if (!period) return;

  db.prepare('DELETE FROM expenses WHERE id = ?').run(id);
  const newTotal = recalcPeriodTotal(expense.period_id);

  res.json({ ok: true, period_total_cents: newTotal });
});

module.exports = router;