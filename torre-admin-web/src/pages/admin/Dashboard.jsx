import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api';
import Layout from '../../components/Layout';
import Button from '../../components/ui/Button';
import StatusCard from '../../components/ui/StatusCard';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../components/ui/ToastProvider';
import { formatCents, formatPeriod, MONTHS_ES } from '../../utils/format';

export default function AdminDashboard() {
  const { user } = useAuth();
  const { showToast } = useToast();

  const [periods, setPeriods] = useState([]);
  const [activeAptsCount, setActiveAptsCount] = useState(0);
  const [lastSummary, setLastSummary] = useState(null);
  const [lastClosed, setLastClosed] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      // Carga paralela: períodos + deptos
      const [periodsRes, usersRes] = await Promise.all([
        api.get('/periods'),
        api.get('/users'),
      ]);
      const list = periodsRes.periods || [];
      setPeriods(list);

      const apts = usersRes.apartments || [];
      setActiveAptsCount(apts.filter((a) => a.active).length);

      // Último período cerrado
      const closed = list.find((p) => p.status === 'closed');
      setLastClosed(closed || null);
      if (closed) {
        const ch = await api.get(`/periods/${closed.id}/charges`);
        setLastSummary(ch.summary);
      } else {
        setLastSummary(null);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const now = new Date();
  const monthLabel = `${MONTHS_ES[now.getMonth()]} ${now.getFullYear()}`;

  return (
    <Layout>
      {/* Hero */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-700 p-5 sm:p-8 text-white shadow-lg mb-4 sm:mb-6">
        <div className="absolute -right-8 -top-8 w-40 h-40 rounded-full bg-white/10" />
        <div className="absolute -right-16 bottom-0 w-32 h-32 rounded-full bg-white/5" />
        <div className="relative">
          <p className="text-sm text-blue-100 mb-1">{monthLabel}</p>
          <h1 className="text-xl sm:text-3xl font-bold mb-1">
            Hola, {user?.name?.split(' ')[0] || 'Admin'} 👋
          </h1>
          <p className="text-sm text-blue-100">
            Aquí tienes el resumen de la torre
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              onClick={() => { setShowForm(true); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
              className="inline-flex items-center gap-1.5 bg-white text-blue-700 hover:bg-blue-50 font-medium text-sm px-4 py-2 rounded-lg transition"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Nuevo período
            </button>
            <Link
              to="/admin/payments"
              className="inline-flex items-center gap-1.5 bg-white/15 hover:bg-white/25 backdrop-blur-sm border border-white/20 text-white font-medium text-sm px-4 py-2 rounded-lg transition"
            >
              Ver pagos
            </Link>
          </div>
        </div>
      </div>

      {/* Stats globales */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4 mb-4 sm:mb-6">
        <MetricCard
          label="Deptos activos"
          value={activeAptsCount}
          subtitle="participan del reparto"
          icon="building"
          tone="blue"
        />
        <MetricCard
          label="Facturado"
          value={lastSummary ? formatCents(lastSummary.total_billed_cents) : '—'}
          subtitle={lastClosed ? formatPeriod(lastClosed.year, lastClosed.month) : 'Sin cerrar aún'}
          icon="receipt"
          tone="slate"
        />
        <MetricCard
          label="Cobrado"
          value={lastSummary ? formatCents(lastSummary.total_paid_cents) : '—'}
          subtitle={lastSummary ? `${lastSummary.paid_count} deptos al día` : 'Sin datos'}
          icon="check"
          tone="emerald"
        />
        <MetricCard
          label="Por cobrar"
          value={lastSummary ? formatCents(lastSummary.total_remaining_cents) : '—'}
          subtitle={lastSummary ? `${lastSummary.pending_count} deptos pendientes` : 'Sin datos'}
          icon="clock"
          tone="red"
        />
      </div>

      {showForm && (
        <CreatePeriodForm
          onCreated={() => { setShowForm(false); load(); }}
          onCancel={() => setShowForm(false)}
        />
      )}

      {error && (
        <StatusCard type="error" title="No se pudieron cargar los períodos" className="mb-4">
          {error}
        </StatusCard>
      )}

      {/* Lista de períodos */}
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-800">Períodos</h2>
        <span className="text-xs text-slate-500">{periods.length} total</span>
      </div>

      {loading ? (
        <StatusCard type="loading" title="Cargando períodos..." />
      ) : periods.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-12 text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-blue-50 flex items-center justify-center">
            <svg className="w-8 h-8 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <h3 className="font-semibold text-slate-800 mb-1">Aún no hay períodos</h3>
          <p className="text-sm text-slate-500 mb-4">
            Crea el primer mes para empezar a registrar gastos.
          </p>
          <Button variant="primary" onClick={() => setShowForm(true)}>
            + Crear primer período
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {periods.map((p) => (
            <PeriodCard key={p.id} period={p} />
          ))}
        </div>
      )}
    </Layout>
  );
}

function MetricCard({ label, value, subtitle, icon, tone = 'slate' }) {
  const tones = {
    slate:   { bg: 'bg-slate-50',   text: 'text-slate-700',   icon: 'text-slate-500' },
    blue:    { bg: 'bg-blue-50',    text: 'text-blue-700',    icon: 'text-blue-500' },
    emerald: { bg: 'bg-emerald-50', text: 'text-emerald-700', icon: 'text-emerald-500' },
    red:     { bg: 'bg-red-50',     text: 'text-red-700',     icon: 'text-red-500' },
  };
  const t = tones[tone] || tones.slate;

  const icons = {
    building: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4',
    receipt: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
    check: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z',
    clock: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z',
  };

  return (
    <div className="min-w-0 bg-white rounded-xl border border-slate-200 shadow-sm p-3 sm:p-4">
      <div className="flex items-start justify-between mb-2">
        <p className="text-xs uppercase tracking-wide text-slate-500 font-medium">{label}</p>
        <div className={`w-8 h-8 rounded-lg ${t.bg} flex items-center justify-center ${t.icon}`}>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={icons[icon]} />
          </svg>
        </div>
      </div>
      <p className={`text-xl sm:text-2xl font-bold ${t.text} leading-tight break-words`}>{value}</p>
      {subtitle && <p className="text-xs text-slate-400 mt-1">{subtitle}</p>}
    </div>
  );
}

function PeriodCard({ period }) {
  const isOpen = period.status === 'open';

  return (
    <Link
      to={`/admin/periods/${period.id}`}
      className={`group block rounded-2xl border bg-white p-5 shadow-sm hover:shadow-md transition-all hover:-translate-y-0.5 ${
        isOpen ? 'border-amber-200' : 'border-slate-200'
      }`}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <h3 className="font-semibold text-slate-800 text-lg leading-tight">
            {formatPeriod(period.year, period.month)}
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            {isOpen ? 'En preparación' : 'Cerrado'}
          </p>
        </div>
        <span className={`text-xs font-medium px-2.5 py-1 rounded-full whitespace-nowrap ${
          isOpen
            ? 'bg-amber-100 text-amber-800'
            : 'bg-emerald-100 text-emerald-800'
        }`}>
          {isOpen ? 'Abierto' : 'Cerrado'}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:gap-3 mt-3 pt-3 border-t border-slate-100">
        <div>
          <p className="text-[10px] uppercase tracking-wide text-slate-400">Gastos</p>
          <p className="text-sm font-semibold text-slate-800 font-mono">
            {formatCents(period.total_expenses_cents)}
          </p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wide text-slate-400">
            {isOpen ? 'Deptos' : 'Cuota/depto'}
          </p>
          <p className="text-sm font-semibold text-slate-800 font-mono">
            {isOpen ? '—' : formatCents(period.charge_per_apartment_cents)}
          </p>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between">
        <span className="text-xs text-blue-600 font-medium group-hover:underline">
          Ver detalle →
        </span>
        {!isOpen && period.reserve_contribution_cents > 0 && (
          <span className="text-[10px] text-slate-400">
            Fondo: {formatCents(period.reserve_contribution_cents)}
          </span>
        )}
      </div>
    </Link>
  );
}

function CreatePeriodForm({ onCreated, onCancel }) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [mode, setMode] = useState('none');
  const [value, setValue] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      let reserve_value = 0;
      if (mode === 'percent') reserve_value = Number(value);
      else if (mode === 'fixed') reserve_value = Math.round(Number(value) * 100);

      await api.post('/periods', {
        year: Number(year),
        month: Number(month),
        reserve_mode: mode,
        reserve_value,
      });
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
      className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 mb-6"
    >
      <h2 className="font-semibold text-slate-800 mb-3">Nuevo período</h2>

      {error && (
        <StatusCard type="error" title="No se pudo crear el período" compact className="mb-3">
          {error}
        </StatusCard>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Mes</label>
          <select
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {MONTHS_ES.map((m, i) => (
              <option key={i} value={i + 1}>{m}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Año</label>
          <input
            type="number"
            value={year}
            onChange={(e) => setYear(e.target.value)}
            min="2000"
            max="2100"
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Fondo</label>
          <select
            value={mode}
            onChange={(e) => { setMode(e.target.value); setValue(''); }}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="none">Sin fondo</option>
            <option value="percent">% del gasto</option>
            <option value="fixed">Monto fijo</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">
            {mode === 'percent' ? 'Porcentaje (%)' : mode === 'fixed' ? '$ por depto' : '—'}
          </label>
          <input
            type="number"
            value={mode === 'none' ? '' : value}
            onChange={(e) => setValue(e.target.value)}
            min="0"
            max={mode === 'percent' ? 100 : undefined}
            step={mode === 'fixed' ? '0.01' : '1'}
            disabled={mode === 'none'}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm disabled:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <Button type="button" onClick={onCancel} variant="secondary">
          Cancelar
        </Button>
        <Button type="submit" disabled={submitting} variant="primary">
          {submitting ? 'Creando...' : 'Crear'}
        </Button>
      </div>
    </form>
  );
}