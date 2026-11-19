require('dotenv').config();
const express = require('express');
const cookieParser = require('cookie-parser');
const uploadRoutes = require('./routes/uploads');   // ← NUEVA
const path = require('path');                       


// Rutas

const db = require('./db');
const authRoutes = require('./routes/auth');
const periodRoutes = require('./routes/periods');   
const expenseRoutes = require('./routes/expenses');   
const paymentRoutes = require('./routes/payments');   // ← NUEVA

const notificationRoutes = require('./routes/notifications');   // ← NUEVA
const userRoutes = require('./routes/users');   // ← NUEVA

// _____________________________________________________


// ─── Configuración del servidor ─────────────────────────
const cors = require('cors');

const app = express();


app.use(cors({
  origin: 'http://localhost:5173',
  credentials: true,
}));

const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(cookieParser());

app.get('/', (req, res) => {
  res.json({ ok: true, message: '🚀 Servidor de la torre funcionando' });
});

app.get('/health', (req, res) => {
  const r = db.prepare('SELECT 1 AS ok').get();
  res.json({ status: 'ok', db: r.ok === 1 });
});

// ─── RUTAS ─────────────────────────────────────────────

app.use('/api/auth', authRoutes);
app.use('/api/periods', periodRoutes);   
app.use('/api',         expenseRoutes);
app.use('/api/payments', paymentRoutes);   
app.use('/api/uploads',  uploadRoutes);                       // ← NUEVA

app.use('/api/notifications', notificationRoutes);              
app.use('/api/users', userRoutes);   // ← NUEVA
// ──────────────────────────────────────────────────────

app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

db.ready.then(() => {
  app.listen(PORT, () => {
    console.log(`✅ Servidor escuchando en http://localhost:${PORT}`);
  });
}).catch((err) => {
  console.error('❌ Error inicializando SQLite Cloud:', err);
  process.exitCode = 1;
});