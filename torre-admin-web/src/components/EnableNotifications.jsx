import { useEffect, useState } from 'react';
import {
  pushSupported,
  getExistingSubscription,
  enablePushNotifications,
  disablePushNotifications,
} from '../utils/push';
import Button from './ui/Button';
import StatusCard from './ui/StatusCard';

export default function EnableNotifications() {
  const [state, setState] = useState('unknown'); // unknown | unsupported | off | on | working
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      if (!pushSupported()) {
        setState('unsupported');
        return;
      }
      if (Notification.permission === 'denied') {
        setState('denied');
        return;
      }
      const sub = await getExistingSubscription();
      setState(sub ? 'on' : 'off');
    })();
  }, []);

  const handleEnable = async () => {
    setError('');
    setState('working');
    try {
      await enablePushNotifications();
      setState('on');
    } catch (err) {
      setError(err.message);
      setState('off');
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

  if (state === 'unknown') return null;
  if (state === 'unsupported') return null;
  if (state === 'denied') {
    return (
      <StatusCard type="warning" title="Notificaciones bloqueadas" compact>
        Habilítalas desde la configuración del navegador.
      </StatusCard>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-sm font-medium text-slate-800">🔔 Notificaciones push</p>
        <p className="text-xs text-slate-500">
          {state === 'on'
            ? 'Activadas en este navegador.'
            : 'Recibe avisos aunque no tengas la página abierta.'}
        </p>
        {error && (
          <StatusCard type="error" compact className="mt-2">
            {error}
          </StatusCard>
        )}
      </div>
      <Button
        onClick={state === 'on' ? handleDisable : handleEnable}
        disabled={state === 'working'}
        variant={state === 'on' ? 'secondary' : 'primary'}
        className="whitespace-nowrap"
      >
        {state === 'working'
          ? '...'
          : state === 'on'
            ? 'Desactivar'
            : 'Activar'}
      </Button>
    </div>
  );
}