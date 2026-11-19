require('dotenv').config();
const { Database } = require('@sqlitecloud/drivers');
const fs = require('fs');
const path = require('path');

if (!process.env.SQLITECLOUD_URL) {
  throw new Error('❌ Falta SQLITECLOUD_URL en el .env');
}

const db = new Database(process.env.SQLITECLOUD_URL);

const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');

function exec(sql) {
  return new Promise((resolve, reject) => {
    db.exec(sql, (err) => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
}
db.ready = (async () => {
  try {
    await exec('SELECT 1');
    console.log('✅ Conectado a SQLite Cloud (torre-admin)');

    // 1. Ejecutar el esquema (crea tablas si no existen)
    await exec(schema);

    // 2. Migración segura para la columna 'notes'
    // Ejecutamos el PRAGMA y normalizamos la respuesta para obtener un array de columnas
    const pragmaResult = await db.sql('PRAGMA table_info(payments)');
    
    // El driver puede devolver un array directo o un objeto con .rows
    const columns = Array.isArray(pragmaResult) ? pragmaResult : (pragmaResult?.rows || []);
    
    const notesExists = columns.some((column) => column.name === 'notes');

    if (!notesExists) {
      await db.sql('ALTER TABLE payments ADD COLUMN notes TEXT');
      console.log('✅ Columna payments.notes agregada');
    } else {
      console.log('ℹ️ La columna payments.notes ya existe, no se necesita migración.');
    }

    console.log('✅ Esquema verificado y migraciones aplicadas');
  } catch (error) {
    console.error('❌ Error crítico inicializando la base de datos:', error);
    // Es importante rechazar la promesa para que el servidor no arranque en un estado inconsistente
    throw error; 
  }
})();

module.exports = db;