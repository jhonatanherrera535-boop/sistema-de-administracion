const webpush = require('web-push');
const db = require('../db');

const VAPID_PUBLIC = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:admin@torre.com';

if (VAPID_PUBLIC && VAPID_PRIVATE) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
}

async function notify({ userId, type, title, body, link }) {
  // 1. INSERT de la notificación
  const inserted = await db.sql(`
    INSERT INTO notifications (user_id, type, title, body, link)
    VALUES (?, ?, ?, ?, ?)
    RETURNING id
  `, userId, type, title, body || null, link || null);

  const notificationId = inserted[0]?.id;

  // 2. Enviar push si hay VAPID
  if (VAPID_PUBLIC && VAPID_PRIVATE) {
    const subs = await db.sql(
      'SELECT * FROM push_subscriptions WHERE user_id = ?',
      userId
    );
    const payload = JSON.stringify({ title, body, link, type });

    for (const sub of subs) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload
        );
      } catch (err) {
        if (err.statusCode === 410 || err.statusCode === 404) {
          await db.sql('DELETE FROM push_subscriptions WHERE id = ?', sub.id);
        } else {
          console.error('Push error:', err.message);
        }
      }
    }
  }

  return notificationId;
}

async function notifyAdmins(payload) {
  const admins = await db.sql("SELECT id FROM users WHERE role = 'admin' AND active = 1");
  for (const a of admins) {
    await notify({ ...payload, userId: a.id });
  }
}

module.exports = { notify, notifyAdmins };