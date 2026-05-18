/**
 * Prueba de conexión y bulk insert a CARGA.TMP_GESTION.
 * No llama a Wolkvox ni IPBusiness — usa datos sintéticos.
 *
 * Uso:
 *   node scripts/test-ingesta-bulk.js
 *
 * Variables requeridas en .env:
 *   MCOB_DB_SERVER, MCOB_DB_DATABASE, MCOB_DB_USER, MCOB_DB_PASS
 */

require('dotenv').config();
const sql = require('mssql');
const { createPool, limpiarTmpGestiones,
        bulkRegistrarTmpGestiones } = require('../src/shared/ingesta/mcob');

const REGISTROS_PRUEBA = [
  { idConfBi: 1001, idClieBi: 20001, idTelBi: 30001, fecGesVc: '10/05/2025', horGesVc: '08:15:00', tipResSi: 47, tipSolSi: 0, nroTelVc: '999111001', desObsVc: 'NO-ANSWER', rutAudVc: '' },
  { idConfBi: 1001, idClieBi: 20002, idTelBi: 30002, fecGesVc: '10/05/2025', horGesVc: '08:17:30', tipResSi: 46, tipSolSi: 0, nroTelVc: '999111002', desObsVc: 'ANSWER-MACHINE', rutAudVc: '' },
  { idConfBi: 1002, idClieBi: 20003, idTelBi: 30003, fecGesVc: '10/05/2025', horGesVc: '08:20:00', tipResSi: 47, tipSolSi: 0, nroTelVc: '999111003', desObsVc: 'BUSY', rutAudVc: '' },
];

async function main() {
  console.log('=== Test bulk ingesta ===\n');
  console.log(`Servidor : ${process.env.MCOB_DB_SERVER}`);
  console.log(`Base datos: ${process.env.MCOB_DB_DATABASE}`);
  console.log(`Usuario  : ${process.env.MCOB_DB_USER}\n`);

  const pool = createPool({
    server:   process.env.MCOB_DB_SERVER,
    database: process.env.MCOB_DB_DATABASE,
    user:     process.env.MCOB_DB_USER,
    pass:     process.env.MCOB_DB_PASS,
  });

  try {
    // 1. Conectar
    process.stdout.write('[1/4] Conectando a SQL Server... ');
    await pool.connect();
    console.log('OK');

    // 2. Limpiar tabla temporal
    process.stdout.write('[2/4] Ejecutando SP_LIMPIAR_TMP_GESTIONES... ');
    await limpiarTmpGestiones(pool);
    console.log('OK');

    // 3. Bulk insert con datos sintéticos
    process.stdout.write(`[3/4] Bulk insert de ${REGISTROS_PRUEBA.length} registros... `);
    await bulkRegistrarTmpGestiones(pool, REGISTROS_PRUEBA);
    console.log('OK');

    // 4. Verificar que quedaron en la tabla
    process.stdout.write('[4/4] Verificando registros insertados... ');
    const res = await pool.request().query(`
      SELECT ID_GES_BI, ID_CONF_BI, ID_CLIE_BI, ID_TEL_BI,
             FEC_GES_VC, HOR_GES_VC, TIP_RES_SI, NRO_TEL_VC, DES_OBS_VC
      FROM CARGA.TMP_GESTION
      ORDER BY ID_GES_BI DESC
    `);
    console.log(`OK — ${res.recordset.length} fila(s) en tabla\n`);
    console.table(res.recordset);

    console.log('\n✓ Prueba completada correctamente.');
    console.log('  La conexión, SP_LIMPIAR y bulk insert funcionan.\n');

  } catch (err) {
    console.error('\n✗ ERROR:', err.message);
    if (err.originalError) console.error('  Detalle:', err.originalError.message);
    process.exit(1);
  } finally {
    try { await pool.close(); } catch {}
  }
}

main();
