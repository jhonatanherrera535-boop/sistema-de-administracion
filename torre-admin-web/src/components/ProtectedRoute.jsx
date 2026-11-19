import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import StatusCard from './ui/StatusCard';

export default function ProtectedRoute({ role }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
        <StatusCard type="loading" title="Preparando tu espacio seguro..." className="w-full max-w-md" />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  // Si debe cambiar contraseña y no está ya en esa pantalla → redirigir
  if (user.must_change_password && location.pathname !== '/change-password') {
    return <Navigate to="/change-password" replace />;
  }

  if (role && user.role !== role) {
    return <Navigate to={user.role === 'admin' ? '/admin' : '/resident'} replace />;
  }

  return <Outlet />;
}