require('dotenv').config();
const { Database } = require('@sqlitecloud/drivers');
const fs = require('fs');
const path = require('path');

if (!process.env.SQLITECLOUD_URL) {
  throw new Error('❌ Falta SQLITECLOUD_URL en el .env');
}

const db = new Database(process.env.SQLITECLOUD_URL);

db.exec('SELECT 1');
console.log('✅ Conectado a SQLite Cloud (torre-admin)');

// Aplica el schema (idempotente gracias a IF NOT EXISTS)
const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
db.exec(schema);

// Migración: agregar columna notes si no existe.
// El driver de SQLite Cloud no expone los resultados de PRAGMA de forma
// síncrona igual que better-sqlite3, así que envolvemos el ALTER en try/catch
// e ignoramos el error específico de "duplicate column name".
try {
  db.exec('ALTER TABLE payments ADD COLUMN notes TEXT');
} catch (err) {
  if (!/duplicate column name/i.test(err.message)) {
    throw err;
  }
}

console.log('✅ Esquema verificado y migraciones aplicadas');

module.exports = db;