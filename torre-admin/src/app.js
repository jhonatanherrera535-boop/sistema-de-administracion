require('dotenv').config();
const express = require('express');
const cookieParser = require('cookie-parser');
const uploadRoutes = require('./routes/uploads');
const path = require('path');
const cors = require('cors');

// Rutas
const db = require('./db');
const authRoutes = require('./routes/auth');
const periodRoutes = require('./routes/periods');
const expenseRoutes = require('./routes/expenses');
const paymentRoutes = require('./routes/payments');
const notificationRoutes = require('./routes/notifications');
const userRoutes = require('./routes/users');

// ─── Configuración del servidor ─────────────────────────
const app = express();

// En producción: CORS_ORIGIN = https://tu-proyecto.vercel.app
// En desarrollo: CORS_ORIGIN no definido → usa localhost:5173
const allowedOrigin = process.env.CORS_ORIGIN || 'http://localhost:5173';

app.use(cors({
  origin: allowedOrigin,
  credentials: true,
}));

const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(cookieParser());

app.get('/', (req, res) => {
  res.json({ ok: true, message: '🚀 Servidor de la torre funcionando' });
});

// ─── HEALTH CHECK (migrado a SQLite Cloud) ──────────────
app.get('/health', async (req, res) => {
  try {
    const rows = await db.sql('SELECT 1 AS ok');
    res.json({ status: 'ok', db: rows[0]?.ok === 1 });
  } catch (err) {
    console.error('Health check error:', err);
    res.status(500).json({ status: 'error', db: false });
  }
});

// ─── RUTAS ──────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/periods', periodRoutes);
app.use('/api', expenseRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/uploads', uploadRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/users', userRoutes);
// ────────────────────────────────────────────────────────

app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

// ─── ARRANQUE ───────────────────────────────────────────
db.ready.then(() => {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Servidor escuchando en puerto ${PORT}`);
    console.log(`   CORS permitido para: ${allowedOrigin}`);
  });
}).catch((err) => {
  console.error('❌ Error inicializando SQLite Cloud:', err);
  process.exit(1);
});