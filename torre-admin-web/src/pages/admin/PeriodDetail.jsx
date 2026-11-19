import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api';
import Layout from '../../components/Layout';
import Button from '../../components/ui/Button';
import StatusCard from '../../components/ui/StatusCard';
import { useToast } from '../../components/ui/ToastProvider';
import { formatCents, formatPeriod } from '../../utils/format';

export default function PeriodDetail() {
  const { showToast } = useToast();
  const { id } = useParams();
  const navigate = useNavigate();

  const [period, setPeriod] = useState(null);
  const [expenses, setExpenses] = useState([]);
  const [charges, setCharges] = useState([]);
  const [chargeSummary, setChargeSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [payModalFor, setPayModalFor] = useState(null);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const detail = await api.get(`/periods/${id}`);
      setPeriod(detail.period);
      setExpenses(detail.expenses);

      if (detail.period.status === 'closed') {
        const ch = await api.get(`/periods/${id}/charges`);
        setCharges(ch.charges);
        setChargeSummary(ch.summary);
      } else {
        setCharges([]);
        setChargeSummary(null);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [id]);

  const handleDeleteExpense = async (expenseId) => {
    if (!confirm('¿Borrar este gasto?')) return;
    try {
      await api.delete(`/expenses/${expenseId}`);
      await load();
    } catch (err) {
      showToast(err.message, { type: 'error', title: 'No se pudo borrar el gasto' });
    }
  };

  const handleClose = async () => {
    const total = expenses.reduce((s, e) => s + e.amount_cents, 0);
    if (total === 0) {
      showToast('Agrega al menos un gasto antes de cerrar este período.', {
        type: 'warning',
        title: 'Todavía no se puede cerrar',
      });
      return;
    }
    const label = formatPeriod(period.year, period.month);
    if (!confirm(`¿Cerrar el período ${label}? Se generarán las cuotas por departamento y el período quedará bloqueado para edición.`)) {
      return;
    }
    setBusy(true);
    try {
      const res = await api.post(`/periods/${id}/close`);
      const b = res.breakdown;
      showToast(
        `Gastos: ${formatCents(b.total_expenses_cents)}\nFondo: ${formatCents(b.reserve_contribution_cents)}\nA repartir: ${formatCents(b.amount_to_distribute_cents)}\nDepartamentos activos: ${b.active_apartments}\nCuota base: ${formatCents(b.base_cents)}${b.remainder_cents ? `\nAjuste: ${b.remainder_cents} departamento(s) pagan 1 centavo más` : ''}`,
        { type: 'success', title: 'Período cerrado', duration: 10000 }
      );
      await load();
    } catch (err) {
      showToast(err.message, { type: 'error', title: 'No se pudo cerrar el período' });
    } finally {
      setBusy(false);
    }
  };

  const handleReopen = async () => {
    if (!confirm('¿Reabrir este período? Se borrarán las cuotas generadas (no puede haber pagos aprobados).')) return;
    setBusy(true);
    try {
      await api.post(`/periods/${id}/reopen`);
      await load();
    } catch (err) {
      showToast(err.message, { type: 'error', title: 'No se pudo reabrir el período' });
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return <Layout><StatusCard type="loading" title="Cargando período..." /></Layout>;
  }

  if (error) {
    return (
      <Layout>
        <StatusCard type="error" title="No se pudo abrir este período">
          {error}
        </StatusCard>
        <button
          onClick={() => navigate('/admin')}
          className="mt-4 text-sm text-blue-600 hover:underline"
        >
          ← Volver a períodos
        </button>
      </Layout>
    );
  }

  if (!period) return null;

  const isOpen = period.status === 'open';
  const totalExpenses = expenses.reduce((s, e) => s + e.amount_cents, 0);

  return (
    <Layout>
      <div className="mb-4">
        <Link to="/admin" className="text-sm text-blue-600 hover:underline">
          ← Volver a períodos
        </Link>
      </div>

      {/* Cabecera */}
      <div className="bg-gradient-to-br from-white via-white to-blue-50 rounded-2xl shadow-sm border border-blue-100 p-5 mb-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">
              {formatPeriod(period.year, period.month)}
            </h1>
            <span className={`inline-block mt-1 text-xs font-medium px-2.5 py-1 rounded-full ${
              isOpen ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'
            }`}>
              {isOpen ? 'Abierto' : 'Cerrado'}
            </span>
          </div>

          <div className="flex gap-2">
            {isOpen ? (
              <Button
                onClick={handleClose}
                disabled={busy || totalExpenses === 0}
                variant="success"
              >
                {busy ? 'Cerrando...' : 'Cerrar período'}
              </Button>
            ) : (
              <Button
                onClick={handleReopen}
                disabled={busy}
                variant="secondary"
              >
                {busy ? 'Reabriendo...' : 'Reabrir'}
              </Button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-5">
          <Stat label="Gastos" value={formatCents(totalExpenses)} />
          {!isOpen && (
            <>
              <Stat label="Fondo" value={formatCents(period.reserve_contribution_cents)} />
              <Stat label="Cuota/depto" value={formatCents(period.charge_per_apartment_cents)} />
              <Stat label="Deptos activos" value={period.active_apartments_count} />
            </>
          )}
        </div>
      </div>

      {/* Gastos */}
      <section className="bg-white rounded-xl shadow-sm border border-slate-200 mb-4">
        <div className="flex items-center justify-between p-4 border-b border-slate-100">
          <h2 className="font-semibold text-slate-800">Gastos ({expenses.length})</h2>
          {isOpen && (
            <Button
              onClick={() => setShowAddForm((v) => !v)}
              variant="primary"
            >
              {showAddForm ? 'Cancelar' : '+ Agregar gasto'}
            </Button>
          )}
        </div>

        {showAddForm && isOpen && (
          <AddExpenseForm
            periodId={id}
            onCreated={() => { setShowAddForm(false); load(); }}
            onCancel={() => setShowAddForm(false)}
          />
        )}

        {expenses.length === 0 ? (
          <StatusCard type="empty" title="Este período todavía no tiene gastos" className="m-4">
            Registra los gastos para calcular las cuotas por departamento.
          </StatusCard>
        ) : (
          <ul className="divide-y divide-slate-100">
            {expenses.map((e) => (
              <li key={e.id} className="px-4 py-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-slate-800 truncate">{e.concept}</p>
                  <p className="text-xs text-slate-500">
                    {e.date}
                    {e.category && <> · {e.category}</>}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-mono font-medium text-slate-800">
                    {formatCents(e.amount_cents)}
                  </span>
                  {isOpen && (
                    <button
                      onClick={() => handleDeleteExpense(e.id)}
                      className="text-xs text-red-600 hover:underline"
                    >
                      Borrar
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Cuotas (solo si cerrado) */}
      {!isOpen && (
        <section className="bg-white rounded-xl shadow-sm border border-slate-200">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <h2 className="font-semibold text-slate-800">Cuotas por departamento</h2>
            <span className="text-xs text-slate-500">
              Total: {formatCents(charges.reduce((s, c) => s + c.amount_cents, 0))}
            </span>
          </div>
          {charges.length === 0 ? (
            <StatusCard type="empty" title="No hay cuotas generadas" className="m-4">
              Revisa el período o vuelve a generarlas al cerrarlo.
            </StatusCard>
          ) : (
            <>
              {chargeSummary && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 pb-0">
                  <CollectionStat label="Facturado" value={formatCents(chargeSummary.total_billed_cents)} />
                  <CollectionStat
                    label="Cobrado"
                    value={formatCents(chargeSummary.total_paid_cents)}
                    detail={`${chargeSummary.paid_count} deptos al día`}
                    tone="emerald"
                  />
                  <CollectionStat
                    label="En revisión"
                    value={formatCents(chargeSummary.total_pending_cents)}
                    tone="amber"
                  />
                  <CollectionStat
                    label="Por cobrar"
                    value={formatCents(chargeSummary.total_remaining_cents)}
                    detail={`${Math.max(0, chargeSummary.pending_count - charges.filter((c) => c.pending_cents > 0).length)} deptos sin pago`}
                    tone="red"
                  />
                </div>
              )}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-slate-600">
                    <tr>
                      <th className="text-left px-4 py-2 font-medium">Depto</th>
                      <th className="text-right px-4 py-2 font-medium">Cuota</th>
                      <th className="text-right px-4 py-2 font-medium">Cobrado</th>
                      <th className="text-right px-4 py-2 font-medium">Saldo</th>
                      <th className="text-center px-4 py-2 font-medium">Estado</th>
                      <th className="text-right px-4 py-2 font-medium">Acción</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {charges.map((c) => {
                      const remaining = c.amount_cents - c.paid_cents;
                      return (
                        <tr key={c.id} className="hover:bg-slate-50">
                          <td className="px-4 py-2 text-slate-800 font-mono">{c.apartment_number}</td>
                          <td className="px-4 py-2 text-right font-mono">{formatCents(c.amount_cents)}</td>
                          <td className="px-4 py-2 text-right font-mono text-emerald-700">
                            {formatCents(c.paid_cents)}
                          </td>
                          <td className="px-4 py-2 text-right font-mono">
                            {remaining > 0
                              ? <span className="text-red-600">{formatCents(remaining)}</span>
                              : <span className="text-emerald-600">$0.00</span>}
                          </td>
                          <td className="px-4 py-2 text-center">
                            <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full ${
                              c.status === 'paid'
                                ? 'bg-emerald-100 text-emerald-800'
                                : c.pending_cents > 0
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-slate-100 text-slate-700'
                            }`}>
                              {c.status === 'paid' ? 'Pagado' : c.pending_cents > 0 ? 'En revisión' : 'Pendiente'}
                            </span>
                          </td>
                          <td className="px-4 py-2 text-right">
                            {remaining > 0 && (
                              <button
                                onClick={() => setPayModalFor(c)}
                                className="text-xs text-blue-600 hover:underline"
                              >
                                Registrar pago
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>
      )}

      {payModalFor && (
        <ManualPaymentModal
          charge={payModalFor}
          periodId={Number(id)}
          onClose={() => setPayModalFor(null)}
          onCreated={async () => { setPayModalFor(null); await load(); }}
        />
      )}
    </Layout>
  );
}

// ─── Componentes auxiliares (nivel superior) ─────────────

function Stat({ label, value }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className="text-lg font-semibold text-slate-800 mt-0.5">{value}</p>
    </div>
  );
}

function CollectionStat({ label, value, detail, tone = 'slate' }) {
  const tones = {
    slate: 'border-slate-200 text-slate-800',
    emerald: 'border-emerald-200 text-emerald-700',
    amber: 'border-amber-200 text-amber-700',
    red: 'border-red-200 text-red-700',
  };
  return (
    <div className={`bg-white rounded-xl border p-4 ${tones[tone]}`}>
      <p className="text-xs uppercase text-slate-500">{label}</p>
      <p className="text-lg font-bold mt-0.5">{value}</p>
      {detail && <p className="text-[10px] text-slate-400">{detail}</p>}
    </div>
  );
}

function AddExpenseForm({ periodId, onCreated, onCancel }) {
  const today = new Date().toISOString().slice(0, 10);
  const [concept, setConcept] = useState('');
  const [category, setCategory] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(today);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const amountNum = Number(amount);
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      setError('El monto debe ser mayor que cero.');
      return;
    }

    setSubmitting(true);
    try {
      await api.post(`/periods/${periodId}/expenses`, {
        concept: concept.trim(),
        category: category.trim() || null,
        amount_cents: Math.round(amountNum * 100),
        date,
      });
      onCreated();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="p-4 bg-slate-50 border-b border-slate-100">
      {error && (
        <StatusCard type="error" title="No se pudo agregar el gasto" compact className="mb-3">
          {error}
        </StatusCard>
      )}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
        <div className="col-span-2">
          <label className="block text-xs font-medium text-slate-600 mb-1">Concepto</label>
          <input
            value={concept}
            onChange={(e) => setConcept(e.target.value)}
            required
            minLength={2}
            placeholder="Ej: Factura de agua"
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Categoría</label>
          <input
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="Opcional"
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Fecha</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="col-span-2">
          <label className="block text-xs font-medium text-slate-600 mb-1">Monto ($)</label>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
            step="0.01"
            min="0.01"
            placeholder="0.00"
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" onClick={onCancel} variant="secondary">
          Cancelar
        </Button>
        <Button type="submit" disabled={submitting} variant="primary">
          {submitting ? 'Agregando...' : 'Agregar'}
        </Button>
      </div>
    </form>
  );
}

function ManualPaymentModal({ charge, periodId, onClose, onCreated }) {
  const today = new Date().toISOString().slice(0, 10);
  const remaining = (charge.amount_cents - charge.paid_cents) / 100;

  const [amount, setAmount] = useState(remaining.toFixed(2));
  const [date, setDate] = useState(today);
  const [method, setMethod] = useState('manual');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    const amountNum = Number(amount);
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      setError('El monto debe ser mayor que cero.');
      return;
    }

    setSubmitting(true);
    try {
      await api.post('/payments', {
        apartment_id: charge.apartment_id,
        period_id: periodId,
        amount_cents: Math.round(amountNum * 100),
        date,
        method: method.trim() || 'manual',
      });
      await onCreated();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
      <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-lg w-full max-w-md p-6">
        <h2 className="text-lg font-bold text-slate-800 mb-1">
          Registrar pago — Depto {charge.apartment_number}
        </h2>
        <p className="text-xs text-slate-500 mb-4">
          El pago se registrará como aprobado. Útil para pagos recibidos fuera de la app (efectivo, WhatsApp, etc.).
        </p>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg mb-3 text-sm">
            {error}
          </div>
        )}

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Monto ($)</label>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
              step="0.01"
              min="0.01"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-[11px] text-slate-400 mt-1">
              Saldo pendiente: {formatCents(charge.amount_cents - charge.paid_cents)}
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Fecha</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Método</label>
            <input
              value={method}
              onChange={(e) => setMethod(e.target.value)}
              placeholder="efectivo, transferencia, WhatsApp..."
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="text-sm px-4 py-2 rounded-lg border border-slate-300 hover:bg-slate-50 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="text-sm px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-medium disabled:bg-slate-400"
          >
            {submitting ? 'Registrando...' : 'Registrar pago'}
          </button>
        </div>
      </form>
    </div>
  );
}