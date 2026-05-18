/**
 * Diagnóstico de duplicados en CALL.TBL_GESTION_VARIOS para la fecha dada.
 * No hace escrituras.
 *
 * Uso:
 *   node scripts/check-duplicados-wolkvox.js
 *   FECHA=11/05/2026 node scripts/check-duplicados-wolkvox.js
 */

require('dotenv').config();
const { createPool } = require('../src/shared/ingesta/mcob');

async function main() {
  const fecha = process.env.FECHA || (() => {
    const d = new Date(Date.now() - 86_400_000);
    return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
  })();

  console.log(`\nDiagnóstico duplicados — fecha: ${fecha}\n`);

  const pool = createPool({
    server:   process.env.MCOB_DB_SERVER,
    database: process.env.MCOB_DB_DATABASE,
    user:     process.env.MCOB_DB_USER,
    pass:     process.env.MCOB_DB_PASS,
  });
  await pool.connect();

  // 1. Total registros activos para la fecha
  const totalRes = await pool.request().query(`
    SELECT COUNT(*) AS total
    FROM CALL.TBL_GESTION_VARIOS
    WHERE FLG_EST_BO = 1
      AND CONVERT(DATE, FEC_GEST_DT) = CONVERT(DATE, '${fecha}', 103)
  `);
  console.log('Total registros activos fecha:', totalRes.recordset[0].total.toLocaleString());

  // 2. Cuántos son duplicados (NU_ORDEN > 1)
  const dupRes = await pool.request().query(`
    SELECT COUNT(*) AS duplicados
    FROM (
      SELECT ROW_NUMBER() OVER(
        PARTITION BY ID_TEL_BI, ID_CLIE_BI, ID_TIP_GES_SI,
                     ID_TIP_RES_SI, ID_TIP_SOL_SI,
                     FEC_GEST_DT, TEX_OBS_VC, USU_CRE_SI, IP_CRE_VC
        ORDER BY ID_GEST_CALL_BI
      ) AS NU_ORDEN
      FROM CALL.TBL_GESTION_VARIOS
      WHERE FLG_EST_BO = 1
        AND CONVERT(DATE, FEC_GEST_DT) = CONVERT(DATE, '${fecha}', 103)
    ) T
    WHERE NU_ORDEN > 1
  `);
  const duplicados = dupRes.recordset[0].duplicados;
  console.log('Duplicados (NU_ORDEN > 1):', duplicados.toLocaleString());

  // 3. Registros únicos netos
  const totalActivos = totalRes.recordset[0].total;
  console.log('Registros únicos netos:', (totalActivos - duplicados).toLocaleString());

  if (duplicados > 0) {
    console.log('\nATENCIÓN: hay duplicados. Puedes eliminarlos con:');
    console.log(`
UPDATE GSV
SET GSV.FLG_EST_BO=0,
    GSV.USU_ELI_SI=2,
    GSV.FEC_ELI_DT=GETDATE(),
    GSV.IP_ELI_VC='[0:0:0:0]'
FROM (
    SELECT ID_GEST_CALL_BI,
           ROW_NUMBER() OVER(
             PARTITION BY ID_TEL_BI,ID_CLIE_BI,ID_TIP_GES_SI,
                          ID_TIP_RES_SI,ID_TIP_SOL_SI,
                          FEC_GEST_DT,TEX_OBS_VC,USU_CRE_SI,IP_CRE_VC
             ORDER BY ID_GEST_CALL_BI
           ) AS NU_ORDEN
    FROM CALL.TBL_GESTION_VARIOS
    WHERE FLG_EST_BO=1
      AND CONVERT(DATE,FEC_GEST_DT)=CONVERT(DATE,'${fecha}',103)
) DUP
INNER JOIN CALL.TBL_GESTION_VARIOS GSV ON GSV.ID_GEST_CALL_BI=DUP.ID_GEST_CALL_BI
WHERE DUP.NU_ORDEN>1;`);
  } else {
    console.log('\nOK — sin duplicados para esta fecha.');
  }

  // 4. Desglose TMP_GESTION si aún tiene datos
  const tmpRes = await pool.request().query(`
    SELECT COUNT(*) AS filas FROM CARGA.TMP_GESTION
  `).catch(() => null);
  if (tmpRes) {
    console.log('\nTMP_GESTION filas actuales:', tmpRes.recordset[0].filas.toLocaleString());
  }

  await pool.close();
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
