import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api';
import Layout from '../../components/Layout';
import StatusCard from '../../components/ui/StatusCard';
import EnableNotifications from '../../components/EnableNotifications';
import { useAuth } from '../../context/AuthContext';
import { formatCents, formatPeriod } from '../../utils/format';

export default function ResidentDashboard() {
  const { user } = useAuth();
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/payments/my-account')
      .then((data) => setAccounts(data.accounts))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const totalDebt = accounts.reduce((s, a) => s + a.balance_cents, 0);
  const totalPending = accounts.reduce((s, a) => s + a.pending_payments_count, 0);
  const paidCount = accounts.filter((a) => a.charge.status === 'paid').length;
  const withDebtCount = accounts.filter((a) => a.balance_cents > 0).length;

  const heroTone = totalDebt === 0
    ? { bg: 'from-emerald-600 via-emerald-700 to-teal-700', label: '¡Estás al día! 🎉', sub: 'No tienes saldos pendientes' }
    : totalPending > 0
      ? { bg: 'from-amber-500 via-amber-600 to-orange-600', label: 'Saldo pendiente', sub: 'Tienes pagos en revisión' }
      : { bg: 'from-red-600 via-rose-700 to-red-800', label: 'Saldo pendiente', sub: 'Tienes cuotas por pagar' };

  return (
    <Layout>
      {/* Hero de saldo */}
      <div className={`relative overflow-hidden rounded-2xl bg-gradient-to-br ${heroTone.bg} p-5 sm:p-8 text-white shadow-lg mb-4 sm:mb-6`}>
        <div className="absolute -right-8 -top-8 w-40 h-40 rounded-full bg-white/10" />
        <div className="absolute -right-16 bottom-0 w-32 h-32 rounded-full bg-white/5" />
        <div className="relative">
          <p className="text-sm text-white/80 mb-1">
            Hola, {user?.name?.split(' ')[0] || 'Vecino'} 👋 · Depto {user?.apartment_number}
          </p>
          <p className="text-sm text-white/80 mb-2">{heroTone.label}</p>
          <p className="text-3xl sm:text-5xl font-bold tracking-tight break-words">
            {formatCents(totalDebt)}
          </p>
          <p className="text-xs text-white/70 mt-2">{heroTone.sub}</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <SmallStat label="Al día" value={paidCount} tone="emerald" />
        <SmallStat label="Con deuda" value={withDebtCount} tone="red" />
        <SmallStat label="En revisión" value={totalPending} tone="amber" />
      </div>

      <div className="mb-4">
        <EnableNotifications />
      </div>

      {error && (
        <StatusCard type="error" title="No se pudo cargar tu cuenta" className="mb-4">
          {error}
        </StatusCard>
      )}

      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-800">Mis períodos</h2>
        <span className="text-xs text-slate-500">{accounts.length} total</span>
      </div>

      {loading ? (
        <StatusCard type="loading" title="Cargando tu cuenta..." />
      ) : accounts.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-12 text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-slate-100 flex items-center justify-center text-3xl">
            📋
          </div>
          <h3 className="font-semibold text-slate-800 mb-1">Aún no tienes cuotas</h3>
          <p className="text-sm text-slate-500">
            Cuando el administrador cierre un período, verás aquí tu cuota.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {accounts.map((a) => (
            <AccountCard key={a.period_id} account={a} />
          ))}
        </div>
      )}
    </Layout>
  );
}

function SmallStat({ label, value, tone }) {
  const tones = {
    emerald: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-100' },
    red:     { bg: 'bg-red-50',     text: 'text-red-700',     border: 'border-red-100' },
    amber:   { bg: 'bg-amber-50',   text: 'text-amber-700',   border: 'border-amber-100' },
  };
  const t = tones[tone];
  return (
    <div className={`${t.bg} ${t.border} border rounded-xl p-3 text-center`}>
      <p className={`text-2xl font-bold ${t.text}`}>{value}</p>
      <p className="text-[11px] uppercase tracking-wide text-slate-500 mt-0.5">{label}</p>
    </div>
  );
}

function AccountCard({ account }) {
  const isPaid = account.charge.status === 'paid';
  const hasPending = account.pending_payments_count > 0;
  const progress = account.charge.amount_cents > 0
    ? Math.min(100, Math.round((account.paid_cents / account.charge.amount_cents) * 100))
    : 0;

  return (
    <Link
      to={`/resident/periods/${account.period_id}`}
      className="group block bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all p-5"
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <h3 className="font-semibold text-slate-800 text-lg leading-tight">
            {formatPeriod(account.year, account.month)}
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Cuota: {formatCents(account.charge.amount_cents)}
          </p>
        </div>
        <span className={`text-xs font-medium px-2.5 py-1 rounded-full whitespace-nowrap ${
          isPaid
            ? 'bg-emerald-100 text-emerald-800'
            : hasPending
              ? 'bg-amber-100 text-amber-800'
              : 'bg-red-100 text-red-800'
        }`}>
          {isPaid ? 'Pagado' : hasPending ? 'En revisión' : 'Pendiente'}
        </span>
      </div>

      {/* Barra de progreso */}
      <div className="mb-3">
        <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${
              isPaid ? 'bg-emerald-500' : hasPending ? 'bg-amber-500' : 'bg-red-500'
            }`}
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="flex items-center justify-between mt-1.5">
          <p className="text-[10px] text-slate-400">
            Pagado: {formatCents(account.paid_cents)}
          </p>
          <p className={`text-[10px] font-medium ${
            account.balance_cents > 0 ? 'text-red-600' : 'text-emerald-600'
          }`}>
            Saldo: {formatCents(account.balance_cents)}
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <span className="text-xs text-blue-600 font-medium group-hover:underline">
          Ver detalle →
        </span>
        {account.balance_cents > 0 && (
          <span className="text-[10px] font-medium text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
            Reportar pago
          </span>
        )}
      </div>
    </Link>
  );
}