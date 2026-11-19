import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import Button from '../components/ui/Button';
import StatusCard from '../components/ui/StatusCard';

export default function ChangePassword() {
  const { user, refreshUser } = useAuth();
  const navigate = useNavigate();

  const isFirstTime = user?.must_change_password;
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (newPassword.length < 8) {
      setError('La nueva contraseña debe tener al menos 8 caracteres');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Las contraseñas no coinciden');
      return;
    }
    if (newPassword === 'Vecino2026') {
      setError('No puedes usar la contraseña temporal. Elige otra.');
      return;
    }

    setSubmitting(true);
    try {
      await api.patch('/auth/password', {
        ...(isFirstTime ? {} : { current_password: currentPassword }),
        new_password: newPassword,
      });

      // Recargar el user del contexto para que must_change_password sea 0
      await refreshUser();

      // Ir al dashboard según rol
      navigate(user.role === 'admin' ? '/admin' : '/resident', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-6">
      <form
        onSubmit={handleSubmit}
        className="bg-white rounded-2xl shadow-lg p-8 max-w-md w-full"
      >
        <div className="mb-6 text-center">
          <span className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-600 to-blue-600 text-2xl text-white shadow-lg shadow-blue-200">
            🔐
          </span>
          <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.16em] text-blue-600">
            Seguridad de la cuenta
          </p>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            {isFirstTime ? 'Cambia tu contraseña' : 'Actualizar contraseña'}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {isFirstTime
              ? `Hola ${user?.name}, elige una contraseña personal para continuar.`
              : 'Ingresa tu contraseña actual y elige una nueva.'}
          </p>
        </div>

        {error && (
          <StatusCard type="error" title="No se pudo actualizar la contraseña" compact className="mb-4">
            {error}
          </StatusCard>
        )}

        {!isFirstTime && (
          <div className="mb-4">
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Contraseña actual
            </label>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
              autoComplete="current-password"
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        )}

        <div className="mb-4">
          <label className="block text-sm font-medium text-slate-700 mb-2">
            Nueva contraseña
          </label>
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
            minLength={8}
            autoComplete="new-password"
            placeholder="Mínimo 8 caracteres"
            className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="mb-6">
          <label className="block text-sm font-medium text-slate-700 mb-2">
            Confirmar nueva contraseña
          </label>
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            minLength={8}
            autoComplete="new-password"
            className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <Button
          type="submit"
          disabled={submitting}
          variant="primary"
          className="w-full"
        >
          {submitting ? 'Guardando...' : 'Guardar contraseña'}
        </Button>
      </form>
    </div>
  );
}