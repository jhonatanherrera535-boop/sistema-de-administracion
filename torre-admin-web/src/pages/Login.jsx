import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Button from '../components/ui/Button';
import StatusCard from '../components/ui/StatusCard';

export default function Login() {
  const { login, user } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Si ya hay sesión, no mostrar el form
  if (user) {
    if (user.must_change_password) {
      return <Navigate to="/change-password" replace />;
    }
    return <Navigate to={user.role === 'admin' ? '/admin' : '/resident'} replace />;
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const u = await login(email, password);
      if (u.must_change_password) {
        navigate('/change-password', { replace: true });
      } else {
        navigate(u.role === 'admin' ? '/admin' : '/resident', { replace: true });
      }
    } catch (err) {
      setError(err.message || 'Error al iniciar sesión');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4 sm:p-6 relative overflow-hidden bg-slate-900"
      style={{
        backgroundImage: `url('/login.jpg')`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      {/* Capa oscura encima de la imagen para contraste */}
      <div className="absolute inset-0 bg-gradient-to-br from-slate-900/70 via-slate-900/50 to-indigo-900/60" />

      {/* Formulario con efecto glass */}
      <form
        onSubmit={handleSubmit}
        className="relative z-10 w-full max-w-md rounded-2xl border border-white/20 bg-white/10 p-8 shadow-2xl backdrop-blur-xl"
      >
        <div className="mb-6 text-center">
          <span className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 text-3xl text-white shadow-lg shadow-blue-500/40">
            🏢
          </span>
          <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.16em] text-blue-200">
            Gestión residencial
          </p>
          <h1 className="text-2xl font-bold tracking-tight text-white">Torre Admin</h1>
          <p className="mt-1 text-sm text-slate-200">Inicia sesión para continuar</p>
        </div>

        {error && (
          <StatusCard type="error" title="No pudimos iniciar sesión" compact className="mb-4">
            {error}
          </StatusCard>
        )}

        <div className="mb-4">
          <label className="block text-sm font-medium text-white/90 mb-2">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            className="w-full rounded-lg border border-white/30 bg-white/10 px-4 py-2 text-white placeholder-white/50 backdrop-blur-sm focus:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-400/50"
            placeholder="admin@torre.com"
          />
        </div>

        <div className="mb-6">
          <label className="block text-sm font-medium text-white/90 mb-2">Contraseña</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
            className="w-full rounded-lg border border-white/30 bg-white/10 px-4 py-2 text-white placeholder-white/50 backdrop-blur-sm focus:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-400/50"
            placeholder="••••••••"
          />
        </div>

        <Button
          type="submit"
          disabled={loading}
          variant="primary"
          className="w-full"
        >
          {loading ? 'Ingresando...' : 'Ingresar'}
        </Button>

        <p className="mt-6 text-center text-xs text-white/60">
          ¿Olvidaste tu contraseña? Contacta al administrador.
        </p>
      </form>
    </div>
  );
}