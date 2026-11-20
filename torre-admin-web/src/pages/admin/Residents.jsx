import { useEffect, useState } from 'react';
import { api } from '../../api';
import Layout from '../../components/Layout';
import Button from '../../components/ui/Button';
import PageHeader from '../../components/ui/PageHeader';
import StatusCard from '../../components/ui/StatusCard';
import { useToast } from '../../components/ui/ToastProvider';

export default function AdminResidents() {
  const { showToast } = useToast();
  const [data, setData] = useState({ residents: [], apartments: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [creatingFor, setCreatingFor] = useState(null); // apartment para el que se abre el form

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/users');
      setData(res);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleResetPassword = async (resident) => {
    if (!confirm(`¿Resetear la contraseña de ${resident.name} (Depto ${resident.apartment_number})?\n\nLa nueva contraseña será: Vecino2026\n\nEl residente deberá cambiarla al entrar.`)) return;
    try {
      const res = await api.post(`/users/${resident.id}/reset-password`);
      showToast(`Contraseña temporal de ${resident.name}: ${res.temporary_password}`, {
        type: 'success',
        title: 'Contraseña restablecida',
        duration: 10000,
      });
      await load();
    } catch (err) {
      showToast(err.message, { type: 'error', title: 'No se pudo restablecer la contraseña' });
    }
  };

  const handleToggleActive = async (resident) => {
    const next = resident.active ? 0 : 1;
    const verb = resident.active ? 'desactivar' : 'reactivar';
    if (!confirm(`¿${verb.charAt(0).toUpperCase() + verb.slice(1)} la cuenta de ${resident.name}?`)) return;
    try {
      await api.patch(`/users/${resident.id}`, { active: next });
      await load();
    } catch (err) {
      showToast(err.message, { type: 'error', title: 'No se pudo actualizar al residente' });
    }
  };

  const handleToggleApartment = async (apartment) => {
    const next = apartment.active ? 0 : 1;
    const verb = apartment.active ? 'desactivar' : 'activar';
    if (!confirm(`¿${verb.charAt(0).toUpperCase() + verb.slice(1)} el departamento ${apartment.number}?`)) return;
    try {
      await api.patch(`/users/apartments/${apartment.id}`, { active: next });
      await load();
    } catch (err) {
      showToast(err.message, { type: 'error', title: 'No se pudo actualizar el departamento' });
    }
  };

  const handleDelete = async (resident) => {
    if (!confirm(`¿Borrar a ${resident.name} (Depto ${resident.apartment_number})?\n\nSolo se puede si no tiene pagos registrados.`)) return;
    try {
      await api.delete(`/users/${resident.id}`);
      await load();
    } catch (err) {
      showToast(err.message, { type: 'error', title: 'No se pudo eliminar al residente' });
    }
  };

  return (
    <Layout>
      <PageHeader
        icon="👥"
        title="Residentes"
        description="Crea y administra las cuentas de acceso de cada departamento."
      />

      {error && (
        <StatusCard type="error" title="No se pudo cargar la lista de residentes" compact className="mb-4">
          {error}
        </StatusCard>
      )}

      {loading ? (
        <StatusCard type="loading" title="Cargando residentes..." />
      ) : data.apartments.length === 0 ? (
        <StatusCard type="empty" title="No hay departamentos registrados">
          Agrega departamentos antes de crear cuentas para residentes.
        </StatusCard>
      ) : (
        <>
          <div className="space-y-3 md:hidden">
            {data.apartments.map((apt) => {
              const resident = data.residents.find((r) => r.apartment_id === apt.id);
              const hasResident = !!resident;

              return (
                <article key={apt.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-slate-500">Departamento</p>
                      <p className="font-mono font-semibold text-slate-800">{apt.number}</p>
                    </div>
                    <button
                      type="button"
                      title={`Cambiar estado del departamento ${apt.number}`}
                      aria-label={`${apt.active ? 'Desactivar' : 'Activar'} departamento ${apt.number}`}
                      onClick={() => handleToggleApartment(apt)}
                      className={`inline-flex shrink-0 cursor-pointer items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 ${
                        apt.active
                          ? 'border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100'
                          : 'border-slate-200 bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      Depto: {apt.active ? 'Activo' : 'Inactivo'}
                    </button>
                  </div>

                  <div className="mt-3 min-w-0 border-t border-slate-100 pt-3">
                    {hasResident ? (
                      <>
                        <p className="break-words font-medium text-slate-800">{resident.name}</p>
                        {resident.email && (
                          <p className="mt-0.5 break-all text-sm text-slate-600">{resident.email}</p>
                        )}
                        {resident.phone && (
                          <p className="mt-0.5 text-sm text-slate-500">{resident.phone}</p>
                        )}
                        {resident.must_change_password ? (
                          <span className="mt-2 inline-block rounded bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-800">
                            Debe cambiar contraseña
                          </span>
                        ) : null}
                      </>
                    ) : (
                      <p className="text-sm italic text-slate-400">Sin residente asignado</p>
                    )}
                  </div>

                  {hasResident && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        title={`Cambiar estado de ${resident.name}`}
                        aria-label={`${resident.active ? 'Desactivar' : 'Activar'} cuenta de ${resident.name}`}
                        onClick={() => handleToggleActive(resident)}
                        className={`inline-flex cursor-pointer items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 ${
                          resident.active
                            ? 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                            : 'border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100'
                        }`}
                      >
                        Vecino: {resident.active ? 'Activo' : 'Inactivo'}
                      </button>
                    </div>
                  )}

                  <div className="mt-3 flex flex-wrap gap-2 border-t border-slate-100 pt-3">
                    {hasResident ? (
                      <>
                        <button
                          type="button"
                          onClick={() => handleResetPassword(resident)}
                          className="min-h-10 rounded-lg border border-amber-200 px-3 text-sm font-medium text-amber-700 hover:bg-amber-50"
                        >
                          Resetear contraseña
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(resident)}
                          className="min-h-10 rounded-lg border border-red-200 px-3 text-sm font-medium text-red-600 hover:bg-red-50"
                        >
                          Borrar
                        </button>
                      </>
                    ) : (
                      <Button
                        onClick={() => setCreatingFor(apt)}
                        variant="primary"
                        className="w-full"
                      >
                        + Crear residente
                      </Button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>

          <div className="hidden rounded-xl border border-slate-200 bg-white shadow-sm md:block md:overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Depto</th>
                <th className="text-left px-4 py-3 font-medium">Residente</th>
                <th className="text-left px-4 py-3 font-medium hidden md:table-cell">Email</th>
                <th className="text-center px-4 py-3 font-medium">Estado</th>
                <th className="text-right px-4 py-3 font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.apartments.map((apt) => {
                const resident = data.residents.find((r) => r.apartment_id === apt.id);
                const hasResident = !!resident;

                return (
                  <tr key={apt.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-mono text-slate-800 whitespace-nowrap">
                      {apt.number}
                    </td>

                    <td className="px-4 py-3 text-slate-800">
                      {hasResident ? (
                        <div>
                          <p className="font-medium">{resident.name}</p>
                          {resident.phone && (
                            <p className="text-xs text-slate-500">{resident.phone}</p>
                          )}
                          {resident.must_change_password ? (
                            <span className="inline-block mt-1 text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">
                              Debe cambiar contraseña
                            </span>
                          ) : null}
                        </div>
                      ) : (
                        <span className="text-slate-400 italic">Sin asignar</span>
                      )}
                    </td>

                    <td className="px-4 py-3 text-slate-600 hidden md:table-cell">
                      {resident?.email || '—'}
                    </td>

                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center justify-center gap-2">
                        <button
                          type="button"
                          title={`Cambiar estado del departamento ${apt.number}`}
                          aria-label={`${apt.active ? 'Desactivar' : 'Activar'} departamento ${apt.number}`}
                          onClick={() => handleToggleApartment(apt)}
                          className={`inline-flex cursor-pointer items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 ${
                            apt.active
                              ? 'border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100'
                              : 'border-slate-200 bg-slate-100 text-slate-600 hover:bg-slate-200'
                          }`}
                        >
                          Depto: {apt.active ? 'Activo' : 'Inactivo'}
                        </button>
                        {hasResident ? (
                          <button
                            type="button"
                            title={`Cambiar estado de ${resident.name}`}
                            aria-label={`${resident.active ? 'Desactivar' : 'Activar'} cuenta de ${resident.name}`}
                            onClick={() => handleToggleActive(resident)}
                            className={`inline-flex cursor-pointer items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 ${
                              resident.active
                                ? 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                                : 'border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100'
                            }`}
                          >
                            Vecino: {resident.active ? 'Activo' : 'Inactivo'}
                          </button>
                        ) : (
                          <span
                            title="Este departamento todavía no tiene residente asignado"
                            className="inline-flex items-center rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-400"
                          >
                            Vecino: Sin asignar
                          </span>
                        )}
                      </div>
                    </td>

                    <td className="px-4 py-3 text-right">
                      {hasResident ? (
                        <div className="flex justify-end gap-2 flex-wrap">
                          <button
                            onClick={() => handleResetPassword(resident)}
                            className="text-xs text-amber-700 hover:underline whitespace-nowrap"
                          >
                            Resetear
                          </button>
                          <button
                            onClick={() => handleDelete(resident)}
                            className="text-xs text-red-600 hover:underline whitespace-nowrap"
                          >
                            Borrar
                          </button>
                        </div>
                      ) : (
                        <Button
                          onClick={() => setCreatingFor(apt)}
                          variant="primary"
                          className="whitespace-nowrap"
                        >
                          + Crear
                        </Button>
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

      {creatingFor && (
        <CreateResidentModal
          apartment={creatingFor}
          onClose={() => setCreatingFor(null)}
          onCreated={async () => {
            setCreatingFor(null);
            await load();
          }}
        />
      )}
    </Layout>
  );
}

function CreateResidentModal({ apartment, onClose, onCreated }) {
  const { showToast } = useToast();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const res = await api.post('/users', {
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim() || null,
        apartment_id: apartment.id,
      });
      showToast(
        `Depto: ${apartment.number}\nNombre: ${res.user.name}\nEmail: ${res.user.email}\nContraseña inicial: ${res.initial_password}\nEl residente deberá cambiarla al entrar por primera vez.`,
        { type: 'success', title: 'Residente creado', duration: 10000 }
      );
      onCreated();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center overflow-y-auto bg-black/40 p-4 z-50">
      <form
        onSubmit={handleSubmit}
        className="my-auto max-h-[calc(100vh-2rem)] w-full max-w-md overflow-y-auto rounded-xl bg-white p-6 shadow-lg"
      >
        <h2 className="text-lg font-bold text-slate-800 mb-1">
          Nuevo residente — Depto {apartment.number}
        </h2>
        <p className="text-xs text-slate-500 mb-4">
          Se creará con contraseña temporal <strong>Vecino2026</strong> que deberá cambiar al entrar.
        </p>

        {error && (
          <StatusCard type="error" title="Revisa los datos ingresados" compact className="mb-3">
            {error}
          </StatusCard>
        )}

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Nombre completo</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              minLength={2}
              placeholder="Ej: Juan Pérez"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="vecino0b@torre.com"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Teléfono <span className="text-slate-400 font-normal">(opcional)</span>
            </label>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+58 412-1234567"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <Button
            type="button"
            onClick={onClose}
            disabled={submitting}
            variant="secondary"
          >
            Cancelar
          </Button>
          <Button
            type="submit"
            disabled={submitting}
            variant="primary"
          >
            {submitting ? 'Creando...' : 'Crear residente'}
          </Button>
        </div>
      </form>
    </div>
  );
}