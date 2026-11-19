require('dotenv').config();
const db = require('../db');
const { hashPassword } = require('../services/auth');

async function main() {
  // 1) Departamentos: 5 pisos (0 a 4) × 4 (A-D) = 20
  const letters = ['A', 'B', 'C', 'D'];
  const insertApt = db.prepare(
    'INSERT OR IGNORE INTO apartments (number, floor, active) VALUES (?, ?, 0)'
  );
  let created = 0;
  for (let floor = 0; floor <= 4; floor++) {
    for (const letter of letters) {
      const r = insertApt.run(`${floor}${letter}`, floor);
      if (r.changes > 0) created++;
    }
  }
  console.log(`🏢 Departamentos nuevos: ${created} (los existentes se omiten)`);

  // 2) Admin
  const [email, password, name = 'Administrador'] = process.argv.slice(2);
  if (!email || !password) {
    console.log('ℹ️  Uso: node src/scripts/seed.js <email> <password> [nombre]');
    console.log('    Ej:  node src/scripts/seed.js admin@torre.com clave12345 "Admin"');
    process.exit(0);
  }
  if (password.length < 8) {
    console.error('❌ La contraseña debe tener al menos 8 caracteres.');
    process.exit(1);
  }

  const cleanEmail = email.toLowerCase().trim();
  if (db.prepare('SELECT id FROM users WHERE email = ?').get(cleanEmail)) {
    console.log('ℹ️  El usuario ya existe. No se hace nada.');
    process.exit(0);
  }

  const hash = await hashPassword(password);
  db.prepare(
    `INSERT INTO users (email, password_hash, name, role) VALUES (?, ?, ?, 'admin')`
  ).run(cleanEmail, hash, name);

  console.log(`👤 Admin creado: ${cleanEmail}`);
  process.exit(0);
}

main().catch((err) => { console.error(err); process.exit(1); });