const webpush = require('web-push');
const db = require('../db');

const VAPID_PUBLIC = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:admin@torre.com';

if (VAPID_PUBLIC && VAPID_PRIVATE) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
}

// Crea notificación in-app y, si hay suscripciones, envía push
async function notify({ userId, type, title, body, link }) {
  const info = db.prepare(`
    INSERT INTO notifications (user_id, type, title, body, link)
    VALUES (?, ?, ?, ?, ?)
  `).run(userId, type, title, body || null, link || null);

  if (VAPID_PUBLIC && VAPID_PRIVATE) {
    const subs = db.prepare('SELECT * FROM push_subscriptions WHERE user_id = ?').all(userId);
    const payload = JSON.stringify({ title, body, link, type });
    for (const sub of subs) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload
        );
      } catch (err) {
        if (err.statusCode === 410 || err.statusCode === 404) {
          // Suscripción expirada → borrar
          db.prepare('DELETE FROM push_subscriptions WHERE id = ?').run(sub.id);
        } else {
          console.error('Push error:', err.message);
        }
      }
    }
  }
  return info.lastInsertRowid;
}

// Notifica a todos los admins activos
async function notifyAdmins(payload) {
  const admins = db.prepare("SELECT id FROM users WHERE role = 'admin' AND active = 1").all();
  for (const a of admins) {
    await notify({ ...payload, userId: a.id });
  }
}

module.exports = { notify, notifyAdmins };