// Read-only: valida que el SP companion es consistente con SP_LISTAR_ASTERISK_SERVIDOR.
// Para cada servidor, el MIN/MAX de campañas del SP companion debe coincidir con el rango del SP original.
require('dotenv').config();
const sql = require('mssql');

async function main() {
  const pool = await sql.connect({
    server: process.env.MCOB_DB_SERVER, database: process.env.MCOB_DB_DATABASE,
    user: process.env.MCOB_DB_USER, password: process.env.MCOB_DB_PASS,
    connectionTimeout: 20000, requestTimeout: 60000,
    options: { encrypt: false, trustServerCertificate: true, enableArithAbort: true },
  });

  const rango = (await pool.request().execute('ASTERISK.SP_LISTAR_ASTERISK_SERVIDOR')).recordset;
  const camps = (await pool.request().execute('ASTERISK.SP_LISTAR_ASTERISK_SERVIDOR_CAMPANA')).recordset;

  const porServidor = new Map();
  for (const c of camps) {
    const k = `${c.AMI_HOST_VC}|${c.AMI_USER_VC}|${c.TIM_EJE_SI}`;
    if (!porServidor.has(k)) porServidor.set(k, []);
    porServidor.get(k).push(c.ID_CAMP_PROV_EXT_SI);
  }

  // NOTA: desde 2026-07-21 el companion usa una ventana MÁS AMPLIA (5 días) que el SP
  // original (3 días). Es esperado que el companion tenga MÁS campañas. Este verificador
  // ya no exige igualdad: solo informa las campañas extra que captura la ventana ampliada.
  for (const r of rango) {
    const k = `${r.AMI_HOST_VC}|${r.AMI_USER_VC}|${r.TIM_EJE_SI}`;
    const lista = (porServidor.get(k) || []).slice().sort((a, b) => a - b);
    const extra = lista.filter(c => c < r.CAMP_MIN_PROV_EXT || c > r.CAMP_MAX_PROV_EXT);
    const min = lista.length ? Math.min(...lista) : null;
    const max = lista.length ? Math.max(...lista) : null;
    console.log(`${r.AMI_HOST_VC} ${r.AMI_USER_VC}: companion=${lista.length} camp [${min}-${max}] vs rango3d [${r.CAMP_MIN_PROV_EXT}-${r.CAMP_MAX_PROV_EXT}]` +
      (extra.length ? `  (+${extra.length} extra por ventana ampliada: ${extra.join(', ')})` : ''));
  }
  await pool.close();
  console.log('\nInforme completo (companion ⊇ rango es lo esperado).');
}
main().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
