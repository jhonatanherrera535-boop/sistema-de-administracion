import { api } from '../api';

// Convierte la VAPID public key (base64url) al formato que pide el navegador
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const output = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    output[i] = rawData.charCodeAt(i);
  }
  return output;
}

// ¿El navegador soporta push?
export function pushSupported() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

// Registra el SW (una sola vez, idempotente)
export async function registerServiceWorker() {
  if (!pushSupported()) return null;
  try {
    const reg = await navigator.serviceWorker.register('/sw.js');
    return reg;
  } catch (err) {
    console.error('SW register error:', err);
    return null;
  }
}

// ¿Ya hay una suscripción activa en este navegador?
export async function getExistingSubscription() {
  if (!pushSupported()) return null;
  const reg = await navigator.serviceWorker.ready;
  return reg.pushManager.getSubscription();
}

// Pide permiso, suscribe al push y envía la suscripción al backend
export async function enablePushNotifications() {
  if (!pushSupported()) {
    throw new Error('Tu navegador no soporta notificaciones push');
  }

  // 1. Permiso
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error('Permiso de notificaciones denegado');
  }

  // 2. Obtener VAPID public key del backend
  const { publicKey } = await api.get('/notifications/vapid-public-key');
  if (!publicKey) {
    throw new Error('El servidor no tiene configurado VAPID');
  }

  // 3. Suscribir con el pushManager
  const reg = await navigator.serviceWorker.ready;
  let subscription = await reg.pushManager.getSubscription();

  if (!subscription) {
    subscription = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });
  }

  // 4. Enviar al backend
  await api.post('/notifications/subscribe', { subscription });

  return subscription;
}

// Desuscribe y avisa al backend
export async function disablePushNotifications() {
  const sub = await getExistingSubscription();
  if (!sub) return;
  await sub.unsubscribe();
  try {
    await api.post('/notifications/unsubscribe', { endpoint: sub.endpoint });
  } catch {
    /* no crítico */
  }
}