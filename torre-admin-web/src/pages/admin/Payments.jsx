import { useEffect, useState } from 'react';
import { api, assetUrl } from '../../api';
import Layout from '../../components/Layout';
import Button from '../../components/ui/Button';
import PageHeader from '../../components/ui/PageHeader';
import StatusCard from '../../components/ui/StatusCard';
import { useToast } from '../../components/ui/ToastProvider';
import { formatCents, formatPeriod } from '../../utils/format';

const TABS = [
  { key: 'pending',  label: 'Pendientes' },
  { key: 'approved', label: 'Aprobados' },
  { key: 'rejected', label: 'Rechazados' },
  { key: 'all',      label: 'Todos' },
];

export default function AdminPayments() {
  const { showToast } = useToast();
  const [tab, setTab] = useState('pending');
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const qs = tab === 'all' ? '' : `?status=${tab}`;
      const data = await api.get(`/payments${qs}`);
      setPayments(data.payments);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [tab]);

  const handleReview = async (id, action) => {
    const verb = action === 'approve' ? 'aprobar' : 'rechazar';
    if (!confirm(`¿${verb.charAt(0).toUpperCase() + verb.slice(1)} este pago?`)) return;
    setBusyId(id);
    try {
      await api.patch(`/payments/${id}/review`, { action });
      await load();
    } catch (err) {
      showToast(err.message, { type: 'error', title: 'No se pudo revisar el pago' });
    } finally {
      setBusyId(null);
    }
  };

  const statusBadge = (status) => {
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
  };

  return (
    <Layout>
      <PageHeader
        icon="💳"
        title="Pagos"
        description="Revisa y administra los reportes de pago de los residentes."
      />

      <div className="flex gap-1 mb-4 bg-white rounded-xl shadow-sm border border-slate-200 p-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 text-sm py-2 px-3 rounded-lg transition ${
              tab === t.key
                ? 'bg-slate-100 font-medium text-slate-800'
                : 'text-slate-600 hover:text-slate-800'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error && (
        <StatusCard type="error" title="No se pudieron cargar los pagos" compact className="mb-4">
          {error}
        </StatusCard>
      )}

      {loading ? (
        <StatusCard type="loading" title="Cargando pagos..." />
      ) : payments.length === 0 ? (
        <StatusCard type="empty" title={tab === 'pending' ? 'Todo al día' : 'No hay pagos en esta vista'}>
          {tab === 'pending'
            ? 'No hay reportes pendientes de revisión por ahora.'
            : 'Cuando existan pagos para este filtro, aparecerán aquí.'}
        </StatusCard>
      ) : (
        <div className="space-y-3">
          {payments.map((p) => (
            <div
              key={p.id}
              className="bg-white rounded-xl shadow-sm border border-slate-200 p-4"
            >
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="font-semibold text-slate-800">
                      Depto {p.apartment_number}
                    </span>
                    {statusBadge(p.status)}
                    {p.method === 'manual' && (
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                        Manual
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-slate-500">
                    {formatPeriod(p.period_year, p.period_month)}
                    {' · '}{p.date}
                    {p.method && <> · {p.method}</>}
                  </p>
                  {p.proof_url ? (
                    <a
                      href={assetUrl(p.proof_url)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-block mt-2 text-sm text-blue-600 hover:underline"
                    >
                      Ver comprobante ↗
                    </a>
                  ) : (
                    <span className="inline-block mt-2 text-xs text-slate-400">
                      Sin comprobante adjunto
                    </span>
                  )}
                  {p.notes && <p className="mt-2 text-xs text-slate-500">{p.notes}</p>}
                </div>
                <div className="text-right">
                  <p className="font-mono text-lg font-semibold text-slate-800">
                    {formatCents(p.amount_cents)}
                  </p>
                  {p.status === 'pending' && (
                    <div className="flex gap-2 mt-2">
                      <Button
                        onClick={() => handleReview(p.id, 'reject')}
                        disabled={busyId === p.id}
                        variant="danger"
                      >
                        Rechazar
                      </Button>
                      <Button
                        onClick={() => handleReview(p.id, 'approve')}
                        disabled={busyId === p.id}
                        variant="success"
                      >
                        Aprobar
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </Layout>
  );
}