// Precheck read-only para el ETL de reporte de gestiones.
// Verifica: conexión, identidad, permisos (crear BD), acceso a BD_MSEG/BD_MCOB,
// si ya existe BD_MCOB_REPORTING, y existencia de las tablas de origen del SP.
require('dotenv').config();
const sql = require('mssql');

const SOURCE_TABLES = [
  'BD_MCOB.CALL.TBL_GESTION_CALL',
  'BD_MCOB.CALL.TBL_GESTION_CALL_CUENTAS',
  'BD_MCOB.CALL.TBL_GESTION_VARIOS',
  'BD_MCOB.CALL.TBL_GESTION_VARIOS_CUENTAS',
  'BD_MCOB.CALL.TBL_TIPO_GESTION',
  'BD_MCOB.CALL.TBL_TIPO_RESULTADO',
  'BD_MCOB.CARGA.TBL_TELEFONO',
  'BD_MCOB.CARGA.TBL_CLIENTE',
  'BD_MCOB.CARGA.TBL_CLIENTE_DATOS_ADICIONALES',
  'BD_MCOB.CARGA.TRF_TIPO_CONDICION',
  'BD_MCOB.CARGA.TRF_STATUS_CLIENTE',
  'BD_MCOB.CARGA.TBL_CUENTA',
  'BD_MCOB.CARGA.TBL_CUENTA_DATOS_ADICIONALES',
  'BD_MCOB.CARGA.TBL_SUB_CARTERA',
  'BD_MCOB.CARGA.TBL_CARTERA',
  'BD_MCOB.CARGA.TBL_PROVEEDOR',
  'BD_MCOB.ADMINISTRACION.TBL_ASIG_CART_SUPERV',
  'BD_MCOB.CONFIGURACION.TBL_CONFIGURACION',
  'BD_MSEG.DBO.TBL_USUARIO',
];

async function main() {
  const cfg = {
    server:   process.env.MCOB_DB_SERVER,
    database: process.env.MCOB_DB_DATABASE,
    user:     process.env.MCOB_DB_USER,
    password: process.env.MCOB_DB_PASS,
    connectionTimeout: 20000,
    requestTimeout: 30000,
    options: { encrypt: false, trustServerCertificate: true, enableArithAbort: true },
  };
  console.log(`Conectando a ${cfg.server} / ${cfg.database} como ${cfg.user}...`);
  const pool = await sql.connect(cfg);

  const info = await pool.request().query(`
    SELECT
      SUSER_SNAME()                          AS login_actual,
      IS_SRVROLEMEMBER('sysadmin')           AS es_sysadmin,
      IS_SRVROLEMEMBER('dbcreator')          AS es_dbcreator,
      HAS_DBACCESS('BD_MCOB')                AS acceso_bd_mcob,
      HAS_DBACCESS('BD_MSEG')                AS acceso_bd_mseg,
      DB_ID('BD_MCOB_REPORTING')             AS id_bd_reporting,
      CONVERT(VARCHAR(120), SERVERPROPERTY('ProductVersion')) AS version_sql
  `);
  console.log('\n=== Conexión / permisos ===');
  console.table(info.recordset);

  console.log('\n=== Tablas de origen (¿existen?) ===');
  const faltantes = [];
  for (const t of SOURCE_TABLES) {
    const r = await pool.request().query(`SELECT OBJECT_ID('${t}') AS id`);
    const ok = r.recordset[0].id != null;
    console.log(`${ok ? 'OK ' : 'NO '} ${t}`);
    if (!ok) faltantes.push(t);
  }

  console.log('\n=== Resumen ===');
  console.log(faltantes.length === 0
    ? 'Todas las tablas de origen existen.'
    : `FALTAN ${faltantes.length}: ${faltantes.join(', ')}`);

  await pool.close();
}

main().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
