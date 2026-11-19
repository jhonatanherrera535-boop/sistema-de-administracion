require('dotenv').config();
const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const dbPath = process.env.DB_PATH || './data/torre.sqlite';
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Aplica el schema cada vez (usa "IF NOT EXISTS", así que es seguro re-ejecutarlo)
const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
db.exec(schema);

const paymentColumns = db.prepare('PRAGMA table_info(payments)').all();
if (!paymentColumns.some((column) => column.name === 'notes')) {
  db.exec('ALTER TABLE payments ADD COLUMN notes TEXT');
}

console.log('✅ Base de datos lista en', dbPath);

module.exports = db;