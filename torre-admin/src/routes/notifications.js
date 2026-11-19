const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// Listar notificaciones del usuario (últimas 50 + contador de no leídas)
router.get('/', requireAuth, (req, res) => {
  const notifications = db.prepare(`
    SELECT id, type, title, body, link, read, created_at
    FROM notifications
    WHERE user_id = ?
    ORDER BY created_at DESC, id DESC
    LIMIT 50
  `).all(req.user.id);

  const unread_count = db.prepare(
    'SELECT COUNT(*) AS c FROM notifications WHERE user_id = ? AND read = 0'
  ).get(req.user.id).c;

  res.json({ notifications, unread_count });
});

// Marcar UNA como leída
router.patch('/:id/read', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'id inválido' });

  const notif = db.prepare(
    'SELECT id FROM notifications WHERE id = ? AND user_id = ?'
  ).get(id, req.user.id);
  if (!notif) return res.status(404).json({ error: 'Notificación no encontrada' });

  db.prepare('UPDATE notifications SET read = 1 WHERE id = ?').run(id);
  res.json({ ok: true });
});

// Marcar TODAS como leídas
router.post('/read-all', requireAuth, (req, res) => {
  db.prepare('UPDATE notifications SET read = 1 WHERE user_id = ? AND read = 0')
    .run(req.user.id);
  res.json({ ok: true });
});

// ─── PUSH ───────────────────────────────────────────────
router.get('/vapid-public-key', (_req, res) => {
  res.json({ publicKey: process.env.VAPID_PUBLIC_KEY || null });
});

router.post('/subscribe', requireAuth, (req, res) => {
  const sub = req.body?.subscription;
  if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) {
    return res.status(400).json({ error: 'Suscripción inválida' });
  }

  db.prepare(`
    INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(endpoint) DO UPDATE SET
      user_id = excluded.user_id,
      p256dh  = excluded.p256dh,
      auth    = excluded.auth
  `).run(req.user.id, sub.endpoint, sub.keys.p256dh, sub.keys.auth);

  res.status(201).json({ ok: true });
});

router.post('/unsubscribe', requireAuth, (req, res) => {
  const endpoint = req.body?.endpoint;
  if (!endpoint) return res.status(400).json({ error: 'endpoint requerido' });
  db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ? AND user_id = ?')
    .run(endpoint, req.user.id);
  res.json({ ok: true });
});

module.exports = router;
