PRAGMA foreign_keys = ON;

-- Departamentos (5 pisos × 4 = 20 posibles)
CREATE TABLE IF NOT EXISTS apartments (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  number     TEXT UNIQUE NOT NULL,
  floor      INTEGER NOT NULL CHECK(floor BETWEEN 0 AND 4),
  active     INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Usuarios (admin y residentes)
CREATE TABLE IF NOT EXISTS users (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  email                TEXT UNIQUE NOT NULL,
  password_hash        TEXT NOT NULL,
  name                 TEXT NOT NULL,
  phone                TEXT,
  role                 TEXT NOT NULL CHECK(role IN ('admin','resident')),
  apartment_id         INTEGER REFERENCES apartments(id),
  active               INTEGER NOT NULL DEFAULT 1,
  must_change_password INTEGER NOT NULL DEFAULT 0,
  created_at           TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Períodos mensuales de facturación
CREATE TABLE IF NOT EXISTS periods (
  id                          INTEGER PRIMARY KEY AUTOINCREMENT,
  year                        INTEGER NOT NULL,
  month                       INTEGER NOT NULL CHECK(month BETWEEN 1 AND 12),
  status                      TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','closed')),
  -- fondo mixto/variable: 'none' | 'percent' | 'fixed'
  reserve_mode                TEXT NOT NULL DEFAULT 'none' CHECK(reserve_mode IN ('none','percent','fixed')),
  reserve_value               INTEGER NOT NULL DEFAULT 0,   -- % (ej. 10) o centavos fijos
  total_expenses_cents        INTEGER NOT NULL DEFAULT 0,
  reserve_contribution_cents  INTEGER NOT NULL DEFAULT 0,
  charge_per_apartment_cents  INTEGER NOT NULL DEFAULT 0,
  active_apartments_count     INTEGER NOT NULL DEFAULT 0,
  closed_at                   TEXT,
  UNIQUE(year, month)
);

-- Gastos del mes
CREATE TABLE IF NOT EXISTS expenses (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  period_id    INTEGER NOT NULL REFERENCES periods(id),
  concept      TEXT NOT NULL,
  category     TEXT,
  amount_cents INTEGER NOT NULL CHECK(amount_cents > 0),
  date         TEXT NOT NULL,
  receipt_url  TEXT,
  created_by   INTEGER REFERENCES users(id),
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Cuota que le toca a cada depto en un período
CREATE TABLE IF NOT EXISTS charges (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  period_id    INTEGER NOT NULL REFERENCES periods(id),
  apartment_id INTEGER NOT NULL REFERENCES apartments(id),
  amount_cents INTEGER NOT NULL,
  status       TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','paid')),
  UNIQUE(period_id, apartment_id)
);

-- Pagos que reportan los residentes
CREATE TABLE IF NOT EXISTS payments (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  apartment_id INTEGER NOT NULL REFERENCES apartments(id),
  period_id    INTEGER NOT NULL REFERENCES periods(id),
  amount_cents INTEGER NOT NULL CHECK(amount_cents > 0),
  method       TEXT,
  notes        TEXT,
  proof_url    TEXT,
  status       TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
  date         TEXT NOT NULL,
  reviewed_by  INTEGER REFERENCES users(id),
  reviewed_at  TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Movimientos del fondo de reserva
CREATE TABLE IF NOT EXISTS fund_movements (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  period_id    INTEGER REFERENCES periods(id),
  type         TEXT NOT NULL CHECK(type IN ('contribution','withdrawal')),
  amount_cents INTEGER NOT NULL CHECK(amount_cents > 0),
  description  TEXT,
  date         TEXT NOT NULL,
  created_by   INTEGER REFERENCES users(id),
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Comunicados
CREATE TABLE IF NOT EXISTS notices (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  title      TEXT NOT NULL,
  body       TEXT NOT NULL,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS notifications (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id),
  type       TEXT NOT NULL,
  title      TEXT NOT NULL,
  body       TEXT,
  link       TEXT,
  read       INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_notifications_user
  ON notifications(user_id, read, created_at DESC);

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id),
  endpoint   TEXT UNIQUE NOT NULL,
  p256dh     TEXT NOT NULL,
  auth       TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);