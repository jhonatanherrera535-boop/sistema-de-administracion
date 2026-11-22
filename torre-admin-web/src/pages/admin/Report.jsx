import { useEffect, useState } from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { api } from '../../api';
import Layout from '../../components/Layout';
import Button from '../../components/ui/Button';
import StatusCard from '../../components/ui/StatusCard';
import { formatCents, MONTHS_ES } from '../../utils/format';

export default function AdminReport() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [year, setYear] = useState(new Date().getFullYear());

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get(`/payments/report?year=${year}`);
      setData(res);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [year]);

  const handleDownloadPDF = () => {
    if (!data) return;

    const { periods, apartments, summary } = data;

    // Filtrar deptos relevantes (con residente o con alguna cuota)
    const relevant = apartments.filter(
      (a) => a.resident_id !== null || a.charges.some((c) => c.amount_cents > 0)
    );

    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

    // Header
    doc.setFontSize(16);
    doc.setTextColor(30, 41, 59);
    doc.text('Estado de Cuenta — Torre Admin', 14, 15);

    doc.setFontSize(10);
    doc.setTextColor(100, 116, 139);
    doc.text(`Año: ${year}`, 14, 22);
    doc.text(`Generado: ${new Date().toLocaleString()}`, 14, 27);
    doc.text(
      `Total facturado: ${formatCents(summary.total_billed)}  ·  ` +
      `Cobrado: ${formatCents(summary.total_paid)}  ·  ` +
      `Por cobrar: ${formatCents(summary.total_remaining)}`,
      14, 32
    );

    // Tabla
    const head = [[
      'Depto',
      'Residente',
      ...periods.map((p) => `${MONTHS_ES[p.month - 1].slice(0, 3)} ${p.year}`),
      'Saldo total',
    ]];

    const body = relevant.map((a) => {
      const cells = a.charges.map((c) => {
        if (c.amount_cents === 0) return '—';
        if (c.balance_cents === 0) return '✓';
        return `$${(c.balance_cents / 100).toFixed(2)}`;
      });
      return [
        a.number,
        a.resident_name || '(sin residente)',
        ...cells,
        `$${(a.total_balance / 100).toFixed(2)}`,
      ];
    });

    autoTable(doc, {
      head,
      body,
      startY: 38,
      styles: { fontSize: 8, cellPadding: 1.5 },
      headStyles: { fillColor: [37, 99, 235], textColor: 255, fontStyle: 'bold' },
      columnStyles: {
        0: { fontStyle: 'bold', cellWidth: 15 },
        1: { cellWidth: 40 },
        [head[0].length - 1]: { fontStyle: 'bold', halign: 'right' },
      },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      didParseCell: (hookData) => {
        // Colorear celdas según estado (verde = pagado, rojo = deuda)
        if (hookData.section === 'body' && hookData.column.index > 1) {
          const raw = String(hookData.cell.raw);
          if (raw === '✓') {
            hookData.cell.styles.textColor = [16, 185, 129];
            hookData.cell.styles.halign = 'center';
          } else if (raw.startsWith('$') && raw !== '$0.00') {
            hookData.cell.styles.textColor = [220, 38, 38];
            hookData.cell.styles.halign = 'right';
          } else {
            hookData.cell.styles.textColor = [148, 163, 184];
            hookData.cell.styles.halign = 'center';
          }
        }
      },
    });

    doc.save(`estado-cuenta-${year}-${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  if (loading) {
    return <Layout><StatusCard type="loading" title="Cargando reporte..." /></Layout>;
  }

  if (error) {
    return (
      <Layout>
        <StatusCard type="error" title="No se pudo cargar el reporte">
          {error}
        </StatusCard>
      </Layout>
    );
  }

  if (!data) return null;

  const { periods, apartments, summary } = data;
  const relevant = apartments.filter(
    (a) => a.resident_id !== null || a.charges.some((c) => c.amount_cents > 0)
  );

  const currentYear = new Date().getFullYear();
  const years = [];
  for (let y = currentYear; y >= currentYear - 5; y--) years.push(y);

  return (
    <Layout>
      <div className="flex items-start justify-between gap-3 mb-6 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Estado de cuenta</h1>
          <p className="text-sm text-slate-500">
            Vista global de pagos por departamento
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {years.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          <Button variant="primary" onClick={handleDownloadPDF}>
            📄 Descargar PDF
          </Button>
        </div>
      </div>

      {/* Resumen */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
        <SummaryCard
          label="Facturado"
          value={formatCents(summary.total_billed)}
          tone="slate"
        />
        <SummaryCard
          label="Cobrado"
          value={formatCents(summary.total_paid)}
          tone="emerald"
        />
        <SummaryCard
          label="Por cobrar"
          value={formatCents(summary.total_remaining)}
          tone="red"
        />
      </div>

      {/* Tabla matricial */}
      {periods.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-500">
          No hay períodos registrados para {year}.
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="text-left px-3 py-2 font-medium sticky left-0 bg-slate-50 z-10">
                    Depto
                  </th>
                  <th className="text-left px-3 py-2 font-medium">Residente</th>
                  {periods.map((p) => (
                    <th
                      key={p.id}
                      className="text-center px-2 py-2 font-medium whitespace-nowrap"
                      title={`${MONTHS_ES[p.month - 1]} ${p.year}`}
                    >
                      {MONTHS_ES[p.month - 1].slice(0, 3)} {String(p.year).slice(2)}
                    </th>
                  ))}
                  <th className="text-right px-3 py-2 font-medium">Saldo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {relevant.length === 0 ? (
                  <tr>
                    <td colSpan={periods.length + 3} className="text-center py-6 text-slate-500">
                      No hay residentes para mostrar en {year}.
                    </td>
                  </tr>
                ) : (
                  relevant.map((a) => (
                    <tr key={a.id} className="hover:bg-slate-50">
                      <td className="px-3 py-2 font-mono text-slate-800 sticky left-0 bg-white">
                        {a.number}
                      </td>
                      <td className="px-3 py-2 text-slate-700 truncate max-w-[160px]">
                        {a.resident_name || <span className="text-slate-400 italic">—</span>}
                      </td>
                      {a.charges.map((c) => (
                        <td key={c.period_id} className="px-2 py-2 text-center">
                          <CellStatus charge={c} />
                        </td>
                      ))}
                      <td className={`px-3 py-2 text-right font-mono font-semibold ${
                        a.total_balance > 0 ? 'text-red-600' : 'text-emerald-600'
                      }`}>
                        {formatCents(a.total_balance)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Layout>
  );
}

function SummaryCard({ label, value, tone }) {
  const tones = {
    slate:   'border-slate-200 text-slate-800',
    emerald: 'border-emerald-200 text-emerald-700',
    red:     'border-red-200 text-red-700',
  };
  return (
    <div className={`bg-white rounded-xl border p-4 ${tones[tone]}`}>
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className="text-2xl font-bold mt-1">{value}</p>
    </div>
  );
}

function CellStatus({ charge }) {
  if (charge.amount_cents === 0) {
    return <span className="text-slate-300 text-xs">—</span>;
  }
  if (charge.balance_cents === 0) {
    return (
      <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold">
        ✓
      </span>
    );
  }
  return (
    <span className="text-xs font-mono text-red-600 font-medium">
      ${(charge.balance_cents / 100).toFixed(2)}
    </span>
  );
}