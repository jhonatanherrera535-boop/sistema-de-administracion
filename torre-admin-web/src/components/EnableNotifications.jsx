import { useEffect, useState } from 'react';
import {
  pushSupported,
  getExistingSubscription,
  enablePushNotifications,
  disablePushNotifications,
} from '../utils/push';

export default function EnableNotifications() {
  const [state, setState] = useState('loading'); // loading | unsupported | denied | off | on | working
  const [error, setError] = useState('');

  const refreshState = async () => {
    if (!pushSupported()) {
      setState('unsupported');
      return;
    }
    if (Notification.permission === 'denied') {
      setState('denied');
      return;
    }
    try {
      const sub = await getExistingSubscription();
      setState(sub ? 'on' : 'off');
    } catch {
      setState('off');
    }
  };

  useEffect(() => {
    refreshState();
  }, []);

  const handleEnable = async () => {
    setError('');
    setState('working');
    try {
      await enablePushNotifications();
      setState('on');
    } catch (err) {
      setError(err.message);
      await refreshState();
    }
  };

  const handleDisable = async () => {
    setError('');
    setState('working');
    try {
      await disablePushNotifications();
      setState('off');
    } catch (err) {
      setError(err.message);
      setState('on');
    }
  };

  // Mientras carga, no muestra nada (evita parpadeo)
  if (state === 'loading') return null;

  // Navegador sin soporte
  if (state === 'unsupported') {
    return (
      <div className="bg-slate-50 border border-slate-200 text-slate-600 text-xs px-3 py-2 rounded-lg">
        Este navegador no soporta notificaciones push.
      </div>
    );
  }

  // Permiso denegado
  if (state === 'denied') {
    return (
      <div className="bg-amber-50 border border-amber-200 text-amber-800 text-xs px-3 py-2 rounded-lg">
        Notificaciones bloqueadas por el navegador. Actívalas desde el candado 🔒 junto a la URL.
      </div>
    );
  }

  // Estado 'on' u 'off': SIEMPRE muestra el botón
  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-sm font-medium text-slate-800">🔔 Notificaciones push</p>
        <p className="text-xs text-slate-500">
          {state === 'on'
            ? 'Activadas en este navegador.'
            : 'Recibe avisos aunque no tengas la página abierta.'}
        </p>
        {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
      </div>
      <button
        onClick={state === 'on' ? handleDisable : handleEnable}
        disabled={state === 'working'}
        className={`text-sm font-medium px-4 py-2 rounded-lg whitespace-nowrap transition-colors ${
          state === 'on'
            ? 'border border-slate-300 hover:bg-slate-50 text-slate-700'
            : 'bg-blue-600 hover:bg-blue-700 text-white'
        } disabled:opacity-50`}
      >
        {state === 'working' ? 'Procesando...' : state === 'on' ? 'Desactivar' : 'Activar'}
      </button>
    </div>
  );
}