const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// ─── LISTAR notificaciones del usuario ──────────────────
router.get('/', requireAuth, async (req, res) => {
  try {
    const notifications = await db.sql(`
      SELECT id, type, title, body, link, read, created_at
      FROM notifications
      WHERE user_id = ?
      ORDER BY created_at DESC, id DESC
      LIMIT 50
    `, req.user.id);

    const unreadRows = await db.sql(
      'SELECT COUNT(*) AS c FROM notifications WHERE user_id = ? AND read = 0',
      req.user.id
    );
    const unread_count = unreadRows[0]?.c || 0;

    res.json({ notifications, unread_count });
  } catch (err) {
    console.error('GET notifications error:', err);
    res.status(500).json({ error: 'Error al cargar notificaciones' });
  }
});

// ─── MARCAR UNA COMO LEÍDA ──────────────────────────────
router.patch('/:id/read', requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'id inválido' });

    const rows = await db.sql(
      'SELECT id FROM notifications WHERE id = ? AND user_id = ?',
      id,
      req.user.id
    );
    if (!rows || rows.length === 0) {
      return res.status(404).json({ error: 'Notificación no encontrada' });
    }

    await db.sql('UPDATE notifications SET read = 1 WHERE id = ?', id);
    res.json({ ok: true });
  } catch (err) {
    console.error('PATCH read error:', err);
    res.status(500).json({ error: 'Error al marcar como leída' });
  }
});

// ─── MARCAR TODAS COMO LEÍDAS ───────────────────────────
router.post('/read-all', requireAuth, async (req, res) => {
  try {
    await db.sql(
      'UPDATE notifications SET read = 1 WHERE user_id = ? AND read = 0',
      req.user.id
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('POST read-all error:', err);
    res.status(500).json({ error: 'Error al marcar todas como leídas' });
  }
});

// ─── PUSH: VAPID public key ─────────────────────────────
router.get('/vapid-public-key', async (_req, res) => {
  res.json({ publicKey: process.env.VAPID_PUBLIC_KEY || null });
});

// ─── PUSH: SUSCRIBIR ────────────────────────────────────
router.post('/subscribe', requireAuth, async (req, res) => {
  try {
    const sub = req.body?.subscription;
    if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) {
      return res.status(400).json({ error: 'Suscripción inválida' });
    }

    // Upsert manual (SQLite Cloud soporta ON CONFLICT, pero por compatibilidad
    // hacemos SELECT + UPDATE/INSERT)
    const existing = await db.sql(
      'SELECT id FROM push_subscriptions WHERE endpoint = ?',
      sub.endpoint
    );

    if (existing && existing.length > 0) {
      await db.sql(
        'UPDATE push_subscriptions SET user_id = ?, p256dh = ?, auth = ? WHERE endpoint = ?',
        req.user.id,
        sub.keys.p256dh,
        sub.keys.auth,
        sub.endpoint
      );
    } else {
      await db.sql(
        'INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth) VALUES (?, ?, ?, ?)',
        req.user.id,
        sub.endpoint,
        sub.keys.p256dh,
        sub.keys.auth
      );
    }

    res.status(201).json({ ok: true });
  } catch (err) {
    console.error('POST subscribe error:', err);
    res.status(500).json({ error: 'Error al suscribir push' });
  }
});

// ─── PUSH: DESUSCRIBIR ──────────────────────────────────
router.post('/unsubscribe', requireAuth, async (req, res) => {
  try {
    const endpoint = req.body?.endpoint;
    if (!endpoint) return res.status(400).json({ error: 'endpoint requerido' });

    await db.sql(
      'DELETE FROM push_subscriptions WHERE endpoint = ? AND user_id = ?',
      endpoint,
      req.user.id
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('POST unsubscribe error:', err);
    res.status(500).json({ error: 'Error al desuscribir push' });
  }
});

module.exports = router;