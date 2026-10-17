// Valida (read-only) que TODAS las columnas referenciadas por
// ETL.SP_PROCESAR_GESTIONES existan en el esquema real de origen.
require('dotenv').config();
const sql = require('mssql');

const CHECKS = [
  { db:'BD_MCOB', schema:'CALL', table:'TBL_GESTION_CALL', cols:[
    'ID_GEST_CALL_BI','ID_TIP_GES_SI','FEC_GEST_DT','FEC_AGE_CITA_DT','HOR_AGE_CITA_VC',
    'FEC_RE_LLAM_DT','HOR_RE_LLAM_VC','HOR_UBI_VC','MTO_CANC_DO','FEC_CANC_DT','NRO_AGENC_VC',
    'FEC_COMPR_DT','IMP_COMPR_DO','FEC_OPOR_DT','IMP_OPOR_DO','VAL_CUOT_INI_DO','FEC_CUOT_INI_DT',
    'VAL_CUOT_MEN_DO','NRO_CUOT_SI','TEX_OBS_VC','ID_TEL_BI','ID_CLIE_BI','ID_TIP_RES_SI',
    'ID_TIP_SOL_SI','ID_ASE_CALL_BI','ID_ASE_ASI_SI','ID_SUPER_ASI_SI','ID_CAN_LLA_SI',
    'ID_CONF_BI','FLG_EST_BO'] },
  { db:'BD_MCOB', schema:'CALL', table:'TBL_GESTION_CALL_CUENTAS', cols:[
    'ID_GEST_CALL_BI','ID_CTA_BI','MON_CAPI_DO','MON_DEUD_TOT_DO','ID_SUB_CART_SI'] },
  { db:'BD_MCOB', schema:'CALL', table:'TBL_GESTION_VARIOS', cols:[
    'ID_GEST_CALL_BI','ID_TIP_GES_SI','FEC_GEST_DT','FEC_COMPR_DT','IMP_COMPR_DO','TEX_OBS_VC',
    'DES_TEL_VC','ID_TEL_BI','ID_CLIE_BI','ID_TIP_RES_SI','ID_TIP_SOL_SI','ID_ASE_CALL_BI',
    'ID_SUPER_ASI_SI','ID_CONF_BI','FLG_EST_BO'] },
  { db:'BD_MCOB', schema:'CALL', table:'TBL_GESTION_VARIOS_CUENTAS', cols:[
    'ID_GEST_CALL_BI','ID_CTA_BI','MON_CAPI_DO','MON_DEUD_TOT_DO','ID_SUB_CART_SI'] },
  { db:'BD_MCOB', schema:'CALL', table:'TBL_TIPO_GESTION', cols:['ID_TIP_GES_SI','DES_TIP_GES_VC'] },
  { db:'BD_MCOB', schema:'CALL', table:'TBL_TIPO_RESULTADO', cols:[
    'ID_TIP_RES_SI','CAL_TIP_RES_SI','DES_TIP_RES_VC','PES_TIP_RES_SI'] },
  { db:'BD_MCOB', schema:'CARGA', table:'TBL_TELEFONO', cols:['ID_TEL_BI','DES_TEL_VC'] },
  { db:'BD_MCOB', schema:'CARGA', table:'TBL_CLIENTE', cols:[
    'ID_CLIE_BI','NRO_DOC_VC','NOM_COMP_VC','ID_STA_CLI_SI','FLG_RET_PRO_BO'] },
  { db:'BD_MCOB', schema:'CARGA', table:'TBL_CLIENTE_DATOS_ADICIONALES', cols:['NRO_DOC_VC','ID_TIP_CON_SI'] },
  { db:'BD_MCOB', schema:'CARGA', table:'TRF_TIPO_CONDICION', cols:['ID_TIP_CON_SI','DESC_COND_VC'] },
  { db:'BD_MCOB', schema:'CARGA', table:'TRF_STATUS_CLIENTE', cols:['ID_STA_CLI_SI','DES_STA_CLI_VC'] },
  { db:'BD_MCOB', schema:'CARGA', table:'TBL_CUENTA', cols:['ID_CTA_BI','NRO_CTA_VC'] },
  { db:'BD_MCOB', schema:'CARGA', table:'TBL_CUENTA_DATOS_ADICIONALES', cols:[
    'ID_CTA_BI','DES_PROD_VC','DES_GRUP_VC','DES_SEGM_VC','DES_ESTR_VC'] },
  { db:'BD_MCOB', schema:'CARGA', table:'TBL_SUB_CARTERA', cols:['ID_SUB_CART_SI','NOM_SUB_CART_VC','ID_CART_SI'] },
  { db:'BD_MCOB', schema:'CARGA', table:'TBL_CARTERA', cols:['ID_CART_SI','NOM_CART_VC','ID_PROV_SI'] },
  { db:'BD_MCOB', schema:'CARGA', table:'TBL_PROVEEDOR', cols:['ID_PROV_SI','NOM_PROV_VC'] },
  { db:'BD_MCOB', schema:'ADMINISTRACION', table:'TBL_ASIG_CART_SUPERV', cols:[
    'ID_SUB_CART_BI','FLG_EST_BO','FLG_ACT_BO','ID_SUPER_SI'] },
  { db:'BD_MCOB', schema:'CONFIGURACION', table:'TBL_CONFIGURACION', cols:['ID_CONF_BI','DES_CON_VC'] },
  { db:'BD_MSEG', schema:'DBO', table:'TBL_USUARIO', cols:['ID_USU_IN','LOG_USU_VC'] },
];

async function main() {
  const pool = await sql.connect({
    server:   process.env.MCOB_DB_SERVER,
    database: process.env.MCOB_DB_DATABASE,
    user:     process.env.MCOB_DB_USER,
    password: process.env.MCOB_DB_PASS,
    connectionTimeout: 20000, requestTimeout: 30000,
    options: { encrypt: false, trustServerCertificate: true, enableArithAbort: true },
  });

  let totalFaltan = 0;
  for (const c of CHECKS) {
    const r = await pool.request().query(
      `SELECT COLUMN_NAME FROM ${c.db}.INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = '${c.schema}' AND TABLE_NAME = '${c.table}'`);
    const real = new Set(r.recordset.map(x => x.COLUMN_NAME.toUpperCase()));
    const faltan = c.cols.filter(col => !real.has(col.toUpperCase()));
    if (faltan.length) {
      totalFaltan += faltan.length;
      console.log(`NO  ${c.db}.${c.schema}.${c.table} -> faltan: ${faltan.join(', ')}`);
    } else {
      console.log(`OK  ${c.db}.${c.schema}.${c.table} (${c.cols.length} cols)`);
    }
  }
  console.log(`\n=== ${totalFaltan === 0 ? 'TODAS las columnas existen ✔' : 'COLUMNAS FALTANTES: ' + totalFaltan} ===`);
  await pool.close();
}

main().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
