/**
 * Muestra columnas de CARGA.TMP_GESTION y texto del SP de ejecución.
 * Sin modificaciones — solo lectura.
 */
require('dotenv').config();
const { createPool } = require('../src/shared/ingesta/mcob');

async function main() {
  const pool = createPool({
    server:   process.env.MCOB_DB_SERVER,
    database: process.env.MCOB_DB_DATABASE,
    user:     process.env.MCOB_DB_USER,
    pass:     process.env.MCOB_DB_PASS,
  });

  await pool.connect();

  // 1. Columnas de TMP_GESTION
  const cols = await pool.request().query(`
    SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH, IS_NULLABLE,
           COLUMNPROPERTY(OBJECT_ID(TABLE_SCHEMA+'.'+TABLE_NAME), COLUMN_NAME, 'IsIdentity') AS ES_IDENTITY
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = 'CARGA' AND TABLE_NAME = 'TMP_GESTION'
    ORDER BY ORDINAL_POSITION
  `);
  console.log('\n── CARGA.TMP_GESTION ─────────────────────────');
  console.table(cols.recordset);

  // 2. Texto del SP de ejecución
  try {
    const sp = await pool.request().query(`
      SELECT definition
      FROM sys.sql_modules
      WHERE object_id = OBJECT_ID('CARGA.SP_EJECUTAR_CARGA_GESTIONES_ASTERISK')
    `);
    if (sp.recordset.length) {
      console.log('\n── SP_EJECUTAR_CARGA_GESTIONES_ASTERISK ──────');
      console.log(sp.recordset[0].definition);
    } else {
      console.log('\n⚠  SP no encontrado en sys.sql_modules (puede requerir permisos VIEW DEFINITION)');
    }
  } catch (e) {
    console.log('\n⚠  No se pudo leer el SP:', e.message);
  }

  await pool.close();
}

main().catch(err => { console.error('Error:', err.message); process.exit(1); });
