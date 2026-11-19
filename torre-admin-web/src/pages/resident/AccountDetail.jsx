import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, assetUrl } from '../../api';
import { useAuth } from '../../context/AuthContext';
import Layout from '../../components/Layout';
import Button from '../../components/ui/Button';
import StatusCard from '../../components/ui/StatusCard';
import { useToast } from '../../components/ui/ToastProvider';
import { formatCents, formatPeriod } from '../../utils/format';

export default function ResidentAccountDetail() {
  const { showToast } = useToast();
  const { id } = useParams();
  const { user } = useAuth();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get(`/payments/account/${user.apartment_id}/period/${id}`);
      setData(res);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [id, user.apartment_id]);

  const handleDeletePayment = async (paymentId) => {
    if (!confirm('¿Borrar este pago? Solo puedes borrar pagos pendientes o rechazados.')) return;
    try {
      await api.delete(`/payments/${paymentId}`);
      await load();
    } catch (err) {
      showToast(err.message, { type: 'error', title: 'No se pudo borrar el pago' });
    }
  };

  if (loading) return <Layout><StatusCard type="loading" title="Cargando el detalle de tu cuenta..." /></Layout>;

  if (error) {
    return (
      <Layout>
        <StatusCard type="error" title="No se pudo cargar el detalle de la cuenta">
          {error}
        </StatusCard>
        <Link to="/resident" className="mt-4 inline-block text-sm text-blue-600 hover:underline">
          ← Volver
        </Link>
      </Layout>
    );
  }

  if (!data || !data.charge) {
    return (
      <Layout>
        <Link to="/resident" className="text-sm text-blue-600 hover:underline">← Volver</Link>
        <StatusCard type="empty" title="Aún no hay información para este período" className="mt-4">
          {data?.note || 'Cuando se genere una cuota, aparecerá aquí.'}
        </StatusCard>
      </Layout>
    );
  }

  const { period, charge, payments, paid_cents, balance_cents } = data;
  const canPay = balance_cents > 0;

  return (
    <Layout>
      <div className="mb-4">
        <Link to="/resident" className="text-sm text-blue-600 hover:underline">← Volver</Link>
      </div>

      {/* Cabecera */}
      <div className="bg-gradient-to-br from-white via-white to-blue-50 rounded-2xl shadow-sm border border-blue-100 p-5 mb-4">
        <h1 className="text-2xl font-bold text-slate-800 mb-1">
          {formatPeriod(period.year, period.month)}
        </h1>
        <p className="text-sm text-slate-500">Depto {data.apartment.number}</p>

        <div className="grid grid-cols-3 gap-4 mt-5">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">Cuota</p>
            <p className="text-lg font-semibold text-slate-800 mt-0.5">
              {formatCents(charge.amount_cents)}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">Pagado</p>
            <p className="text-lg font-semibold text-emerald-600 mt-0.5">
              {formatCents(paid_cents)}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">Saldo</p>
            <p className={`text-lg font-semibold mt-0.5 ${
              balance_cents > 0 ? 'text-red-600' : 'text-emerald-600'
            }`}>
              {formatCents(balance_cents)}
            </p>
          </div>
        </div>
      </div>

      {/* Formulario de pago */}
      {canPay && (
        <ReportPaymentForm
          periodId={Number(id)}
          balanceCents={balance_cents}
          onCreated={load}
        />
      )}

      {/* Historial de pagos */}
      <section className="bg-white rounded-xl shadow-sm border border-slate-200">
        <div className="p-4 border-b border-slate-100">
          <h2 className="font-semibold text-slate-800">
            Pagos reportados ({payments.length})
          </h2>
        </div>
        {payments.length === 0 ? (
          <StatusCard type="empty" title="Aún no has reportado pagos" className="m-4">
            Cuando registres un pago, podrás seguir su estado desde esta sección.
          </StatusCard>
        ) : (
          <ul className="divide-y divide-slate-100">
            {payments.map((p) => (
              <li key={p.id} className="px-4 py-3 flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="font-mono font-medium text-slate-800">
                      {formatCents(p.amount_cents)}
                    </span>
                    <PaymentStatusBadge status={p.status} />
                    {p.method === 'manual' && (
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                        Manual
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500">
                    {p.date}
                    {p.method && <> · {p.method}</>}
                  </p>
                  {p.proof_url && (
                    <a
                      href={assetUrl(p.proof_url)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-block mt-1 text-xs text-blue-600 hover:underline"
                    >
                      Ver comprobante ↗
                    </a>
                  )}
                  {p.notes && <p className="mt-1 text-xs text-slate-500">{p.notes}</p>}
                </div>
                {p.status !== 'approved' && (
                  <button
                    onClick={() => handleDeletePayment(p.id)}
                    className="text-xs text-red-600 hover:underline"
                  >
                    Borrar
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </Layout>
  );
}

function PaymentStatusBadge({ status }) {
  const map = {
    pending:  'bg-amber-100 text-amber-800',
    approved: 'bg-emerald-100 text-emerald-800',
    rejected: 'bg-red-100 text-red-800',
  };
  const label = { pending: 'Pendiente', approved: 'Aprobado', rejected: 'Rechazado' };
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${map[status]}`}>
      {label[status]}
    </span>
  );
}

function ReportPaymentForm({ periodId, balanceCents, onCreated }) {
  const fileInputRef = useRef(null);
  const today = new Date().toISOString().slice(0, 10);

  const [amount, setAmount] = useState((balanceCents / 100).toFixed(2));
  const [date, setDate] = useState(today);
  const [method, setMethod] = useState('');
  const [file, setFile] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setProgress('');

    const amountNum = Number(amount);
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      setError('El monto debe ser mayor que cero.');
      return;
    }

    setSubmitting(true);
    try {
      let proof_url = null;

      if (file) {
        setProgress('Subiendo comprobante...');
        const up = await api.upload(file);
        proof_url = up.url;
      }

      setProgress('Registrando pago...');
      await api.post('/payments', {
        period_id: periodId,
        amount_cents: Math.round(amountNum * 100),
        date,
        method: method.trim() || null,
        proof_url,
      });

      setAmount('');
      setDate(today);
      setMethod('');
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      setProgress('');

      onCreated();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 mb-4"
    >
      <h2 className="font-semibold text-slate-800 mb-3">Reportar un pago</h2>

      {error && (
        <StatusCard type="error" title="No se pudo reportar el pago" compact className="mb-3">
          {error}
        </StatusCard>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
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
          <label className="block text-xs font-medium text-slate-600 mb-1">Método</label>
          <input
            value={method}
            onChange={(e) => setMethod(e.target.value)}
            placeholder="Transferencia, pago móvil, efectivo..."
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      <div className="mb-4">
        <label className="block text-xs font-medium text-slate-600 mb-1">
          Comprobante (JPG, PNG, WEBP o PDF · máx. 10 MB)
        </label>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,application/pdf"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="block w-full text-sm text-slate-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-slate-100 file:text-slate-700 hover:file:bg-slate-200"
        />
      </div>

      <div className="flex items-center justify-between">
        <span className="text-xs text-slate-500">
          {progress || 'El administrador revisará y aprobará tu pago.'}
        </span>
        <Button
          type="submit"
          disabled={submitting}
          variant="primary"
        >
          {submitting ? 'Enviando...' : 'Reportar pago'}
        </Button>
      </div>
    </form>
  );
}