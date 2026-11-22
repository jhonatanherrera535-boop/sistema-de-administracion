import { useState, useRef, useEffect } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import NotificationBell from './NotificationBell';
import ThemeToggle from './ThemeToggle';

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  // Cerrar el dropdown de usuario al hacer click fuera
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  const handleLogout = async () => {
    setMenuOpen(false);
    await logout();
    navigate('/login', { replace: true });
  };

  const isAdmin = user?.role === 'admin';
  const label = isAdmin
    ? 'Admin'
    : user?.apartment_number ? `Depto ${user.apartment_number}` : 'Residente';
  const initials = (user?.name || '?')
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const navLinkClass = ({ isActive }) =>
    `px-3 py-1.5 rounded-lg text-center text-sm font-medium border transition-colors ${
      isActive
        ? 'bg-blue-50 border-blue-200 text-blue-700'
        : 'border-transparent text-slate-600 hover:text-slate-800 hover:bg-slate-50 hover:border-slate-200'
    }`;

  return (
    <div className="min-h-screen w-full overflow-x-hidden bg-slate-100">
      <header className="bg-white/85 backdrop-blur-md border-b border-slate-200 sticky top-0 z-30">
        <div className="max-w-5xl mx-auto px-3 sm:px-4 py-2.5 flex items-center justify-between gap-2">
          {/* Izquierda: logo + navegación */}
          <div className="flex items-center gap-3 sm:gap-5 min-w-0">
            <Link
              to={isAdmin ? '/admin' : '/resident'}
              className="flex items-center gap-2 group"
            >
              <span className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-white flex items-center justify-center text-base font-bold shadow-sm group-hover:shadow-md transition-shadow">
                🏢
              </span>
              <span className="font-semibold text-slate-800 whitespace-nowrap hidden sm:inline">
                Torre Admin
              </span>
            </Link>

            {isAdmin && (
              <nav className="hidden md:flex items-center gap-1.5">
                <NavLink to="/admin" end className={navLinkClass}>
                  Períodos
                </NavLink>
                <NavLink to="/admin/payments" className={navLinkClass}>
                  Pagos
                </NavLink>
                <NavLink to="/admin/residents" className={navLinkClass}>
                  Residentes
                </NavLink>
                <NavLink to="/admin/report" className={navLinkClass}>
                  Reportes
                </NavLink>
              </nav>
            )}
          </div>

          {/* Derecha: campana + menú usuario */}
          <div className="flex items-center gap-1.5 sm:gap-2">
            <ThemeToggle />
            <NotificationBell />

            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setMenuOpen((v) => !v)}
                className="flex items-center gap-2 pl-1 pr-2 py-1 rounded-full border border-slate-200 hover:bg-slate-50 hover:border-slate-300 transition-colors"
                aria-label="Menú de usuario"
              >
                <span className="w-7 h-7 rounded-full bg-slate-200 text-slate-700 flex items-center justify-center text-xs font-semibold">
                  {initials}
                </span>
                <span className="text-sm text-slate-700 font-medium hidden sm:inline max-w-[120px] truncate">
                  {user?.name || 'Usuario'}
                </span>
                <svg
                  className={`w-3.5 h-3.5 text-slate-400 transition-transform ${menuOpen ? 'rotate-180' : ''}`}
                  fill="none" stroke="currentColor" viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {menuOpen && (
                <div className="fixed left-3 right-3 top-[68px] sm:absolute sm:left-auto sm:right-0 sm:top-auto mt-0 sm:mt-2 w-auto sm:w-60 bg-white rounded-xl shadow-lg border border-slate-200 py-1 z-50">
                  <div className="px-4 py-3 border-b border-slate-100">
                    <p className="text-sm font-semibold text-slate-800 truncate">
                      {user?.name}
                    </p>
                    <p className="text-xs text-slate-500 truncate">
                      {user?.email}
                    </p>
                    <p className="text-xs text-slate-400 mt-1">{label}</p>
                  </div>
                  <Link
                    to="/change-password"
                    onClick={() => setMenuOpen(false)}
                    className="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
                  >
                    Cambiar contraseña
                  </Link>
                  <button
                    onClick={handleLogout}
                    className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 border-t border-slate-100"
                  >
                    Cerrar sesión
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
        {isAdmin && (
          <nav
            aria-label="Navegación de administración"
            className="md:hidden border-t border-slate-100 px-3 py-2 grid grid-cols-2 sm:grid-cols-4 gap-1.5 bg-white"
          >
            <NavLink to="/admin" end className={navLinkClass}>
              Períodos
            </NavLink>
            <NavLink to="/admin/payments" className={navLinkClass}>
              Pagos
            </NavLink>
            <NavLink to="/admin/residents" className={navLinkClass}>
              Residentes
            </NavLink>
            <NavLink to="/admin/report" className={navLinkClass}>
              Reportes
            </NavLink>
          </nav>
        )}
      </header>

      <main className="max-w-5xl mx-auto w-full px-3 py-4 sm:px-6 sm:py-6">{children}</main>
    </div>
  );
}