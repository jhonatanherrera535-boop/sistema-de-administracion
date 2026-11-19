import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import StatusCard from './ui/StatusCard';

export default function NotificationBell() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef(null);

  // Polling cada 30s + fetch inicial
  useEffect(() => {
    let mounted = true;

    const fetchNotifications = async () => {
      try {
        const data = await api.get('/notifications');
        if (!mounted) return;
        setNotifications(data.notifications);
        setUnreadCount(data.unread_count);
      } catch (err) {
        // silencioso — puede ser que el token expire
      }
    };

    fetchNotifications();
    const interval = setInterval(fetchNotifications, 30000);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [user?.id]);

  // Cerrar al hacer click fuera
  useEffect(() => {
    if (!open) return;
    const handleClick = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('pointerdown', handleClick);
    return () => document.removeEventListener('pointerdown', handleClick);
  }, [open]);

  const handleOpenNotification = async (n) => {
    if (!n.read) {
      try {
        await api.patch(`/notifications/${n.id}/read`);
        setNotifications((prev) =>
          prev.map((x) => (x.id === n.id ? { ...x, read: 1 } : x))
        );
        setUnreadCount((c) => Math.max(0, c - 1));
      } catch {
        /* no crítico */
      }
    }
    setOpen(false);
    if (n.link) navigate(n.link);
  };

  const handleMarkAllRead = async () => {
    try {
      await api.post('/notifications/read-all');
      setNotifications((prev) => prev.map((x) => ({ ...x, read: 1 })));
      setUnreadCount(0);
    } catch {
      /* no crítico */
    }
  };

  const refresh = async () => {
    setLoading(true);
    try {
      const data = await api.get('/notifications');
      setNotifications(data.notifications);
      setUnreadCount(data.unread_count);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <button
  onClick={() => {
    setOpen((v) => !v);
    if (!open) refresh();
  }}
  className="relative w-9 h-9 flex items-center justify-center rounded-full border border-slate-200 hover:bg-slate-50 hover:border-slate-300 transition-colors"
  aria-label="Notificaciones"
>
  <svg
    className="w-[18px] h-[18px] text-slate-600"
    fill="none" stroke="currentColor" viewBox="0 0 24 24"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
    />
  </svg>
  {unreadCount > 0 && (
    <span className="absolute -top-0.5 -right-0.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-bold text-white bg-red-600 rounded-full ring-2 ring-white">
      {unreadCount > 9 ? '9+' : unreadCount}
    </span>
  )}
</button>

      {open && (
        <div className="fixed left-3 right-3 top-[112px] sm:absolute sm:left-auto sm:right-0 sm:top-auto sm:mt-2 sm:w-80 sm:max-w-[calc(100vw-2rem)] max-h-[calc(100vh-128px)] bg-white rounded-xl shadow-xl border border-slate-200 z-50 overflow-hidden">
  <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50/50">
    <span className="font-semibold text-sm text-slate-800">Notificaciones</span>
    {unreadCount > 0 && (
      <button
        onClick={handleMarkAllRead}
        className="text-xs text-blue-600 hover:underline"
      >
        Marcar todas
      </button>
    )}
  </div>

          {loading ? (
            <StatusCard type="loading" title="Cargando..." compact className="m-3" />
          ) : notifications.length === 0 ? (
            <StatusCard type="empty" title="Todo al día" compact className="m-3">
              No tienes notificaciones nuevas.
            </StatusCard>
          ) : (
            <ul className="max-h-[calc(100vh-184px)] sm:max-h-80 overflow-y-auto divide-y divide-slate-100">
              {notifications.map((n) => (
                <li key={n.id}>
                  <button
                    onClick={() => handleOpenNotification(n)}
                    className={`w-full text-left px-4 py-3 hover:bg-slate-50 transition ${
                      n.read ? '' : 'bg-blue-50/40'
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      {!n.read && (
                        <span className="mt-1.5 w-2 h-2 bg-blue-500 rounded-full flex-shrink-0" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className={`text-sm ${n.read ? 'text-slate-700' : 'text-slate-900 font-medium'}`}>
                          {n.title}
                        </p>
                        {n.body && (
                          <p className="text-xs text-slate-500 mt-0.5 break-words">
                            {n.body}
                          </p>
                        )}
                        <p className="text-[11px] text-slate-400 mt-1">
                          {new Date(n.created_at + 'Z').toLocaleString()}
                        </p>
                      </div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}