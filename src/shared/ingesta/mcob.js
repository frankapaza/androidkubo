const sql = require('mssql');

function createPool(cfg) {
  return new sql.ConnectionPool({
    server:          cfg.server,
    database:        cfg.database,
    user:            cfg.user,
    password:        cfg.pass,
    requestTimeout:  600000, // 10 min — el SP de ejecución puede tardar con 200K+ registros
    connectionTimeout: 30000,
    options: {
      encrypt: false,
      trustServerCertificate: true,
      enableArithAbort: true,
    },
    pool: { max: 5, min: 0, idleTimeoutMillis: 30000 },
  });
}

async function limpiarTmpGestiones(pool) {
  await pool.request().batch('EXEC CARGA.SP_LIMPIAR_TMP_GESTIONES');
}

// Un único TDS bulk copy en lugar de N round-trips individuales al SP.
// Los nombres de columna deben coincidir con CARGA.TMP_GESTIONES.
// Si la tabla tiene columna IDENTITY, no incluirla aquí — SQL Server la genera.
async function bulkRegistrarTmpGestiones(pool, registros) {
  if (!registros.length) return;

  const table = new sql.Table('CARGA.TMP_GESTION');
  table.create = false;

  // Columnas confirmadas contra CARGA.TMP_GESTION (ID_GES_BI es IDENTITY — se omite)
  table.columns.add('ID_CONF_BI',  sql.BigInt,       { nullable: true });
  table.columns.add('ID_CLIE_BI',  sql.BigInt,       { nullable: true });
  table.columns.add('ID_TEL_BI',   sql.BigInt,       { nullable: true });
  table.columns.add('FEC_GES_VC',  sql.VarChar(10),  { nullable: true });
  table.columns.add('HOR_GES_VC',  sql.VarChar(8),   { nullable: true });
  table.columns.add('TIP_RES_SI',  sql.Int,          { nullable: true });
  table.columns.add('TIP_SOL_SI',  sql.Int,          { nullable: true });
  table.columns.add('NRO_TEL_VC',       sql.VarChar(20),  { nullable: true });
  table.columns.add('DES_OBS_VC',       sql.VarChar(600), { nullable: true });
  table.columns.add('RUT_AUD_VC',       sql.VarChar(100), { nullable: true });
  // Requeridos por SP_EJECUTAR_CARGA_GESTIONES_ASTERISK
  table.columns.add('TIP_GES_SI',        sql.Int,          { nullable: true });
  table.columns.add('ID_TIP_RES_MOD_SI', sql.Int,          { nullable: true });
  table.columns.add('ID_TIP_SOL_MOD_SI', sql.Int,          { nullable: true });
  // LOG_GES_VC → ASE_CALL_VC en TBL_GESTION_VARIOS; ID_GES_CALL_BI → ID_ASE_CALL_BI
  table.columns.add('LOG_GES_VC',        sql.VarChar(20),  { nullable: true });
  table.columns.add('ID_GES_CALL_BI',    sql.BigInt,       { nullable: true });

  for (const r of registros) {
    table.rows.add(
      r.idConfBi, r.idClieBi, r.idTelBi,
      r.fecGesVc, r.horGesVc,
      r.tipResSi, r.tipSolSi,
      r.nroTelVc || '', r.desObsVc || '', r.rutAudVc || '',
      r.tipGesSi        != null ? r.tipGesSi        : 1,
      r.idTipResModSi   != null ? r.idTipResModSi   : r.tipResSi,
      r.idTipSolModSi   != null ? r.idTipSolModSi   : r.tipSolSi,
      r.logGesVc        || 'PROGRESIVO',
      r.idGesCallBi     != null ? r.idGesCallBi     : 0
    );
  }

  await pool.request().bulk(table);
}

async function listarServidoresAsterisk(pool) {
  const res = await pool.request().execute('ASTERISK.SP_LISTAR_ASTERISK_SERVIDOR');
  return res.recordset;
}

// Agrupa el recordset de SP_LISTAR_ASTERISK_SERVIDOR_CAMPANA por servidor.
// Función pura (separada para poder testear sin BD).
function agruparServidoresCampanas(recordset) {
  const mapa = new Map();
  for (const r of recordset) {
    const k = `${r.AMI_HOST_VC}|${r.AMI_USER_VC}|${r.AMI_PASS_VC}|${r.TIM_EJE_SI}`;
    if (!mapa.has(k)) {
      mapa.set(k, { host: r.AMI_HOST_VC, user: r.AMI_USER_VC, token: r.AMI_PASS_VC, timEje: r.TIM_EJE_SI, _set: new Set() });
    }
    mapa.get(k)._set.add(r.ID_CAMP_PROV_EXT_SI);
  }
  return [...mapa.values()].map(s => ({
    host: s.host, user: s.user, token: s.token, timEje: s.timEje,
    campanas: [...s._set].sort((a, b) => a - b),
  }));
}

async function listarServidoresConCampanas(pool) {
  const res = await pool.request().execute('ASTERISK.SP_LISTAR_ASTERISK_SERVIDOR_CAMPANA');
  return agruparServidoresCampanas(res.recordset);
}

async function registrarGestiones(pool) {
  const req = pool.request();
  req.timeout = 300000; // 5 min
  await req.execute('CARGA.SP_EJECUTAR_CARGA_GESTIONES_ASTERISK');
}

// Inactiva duplicados en TBL_GESTION_VARIOS para la fecha indicada (DD/MM/YYYY).
// Retorna la cantidad de registros inactivados.
async function dedupGestionesVarios(pool, fechaDDMMYYYY) {
  const req = pool.request();
  req.timeout = 120000;
  req.input('fecha', sql.VarChar(10), fechaDDMMYYYY);
  const result = await req.query(`
    UPDATE GSV
    SET GSV.FLG_EST_BO    = 0,
        GSV.USU_ELI_SI    = 2,
        GSV.FEC_ELI_DT    = GETDATE(),
        GSV.IP_ELI_VC     = '[auto-dedup]'
    FROM (
        SELECT ID_GEST_CALL_BI,
               ROW_NUMBER() OVER (
                 PARTITION BY ID_TEL_BI, ID_CLIE_BI, ID_TIP_GES_SI,
                              ID_TIP_RES_SI, ID_TIP_SOL_SI,
                              FEC_GEST_DT, TEX_OBS_VC, USU_CRE_SI, IP_CRE_VC
                 ORDER BY ID_GEST_CALL_BI
               ) AS NU_ORDEN
        FROM CALL.TBL_GESTION_VARIOS
        WHERE FLG_EST_BO = 1
          AND CONVERT(DATE, FEC_GEST_DT) = CONVERT(DATE, @fecha, 103)
    ) DUP
    INNER JOIN CALL.TBL_GESTION_VARIOS GSV
      ON GSV.ID_GEST_CALL_BI = DUP.ID_GEST_CALL_BI
    WHERE DUP.NU_ORDEN > 1
  `);
  return result.rowsAffected[0] || 0;
}

module.exports = {
  createPool,
  limpiarTmpGestiones,
  bulkRegistrarTmpGestiones,
  listarServidoresAsterisk,
  listarServidoresConCampanas,
  agruparServidoresCampanas,
  registrarGestiones,
  dedupGestionesVarios,
};
