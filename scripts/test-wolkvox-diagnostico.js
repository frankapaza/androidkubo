/**
 * Diagnóstico Wolkvox — sin escrituras a base de datos.
 * Verifica: hora Lima → tipo/fecha, conexión BD, servidores Asterisk, API Wolkvox, descifrado.
 *
 * Uso:
 *   node scripts/test-wolkvox-diagnostico.js
 *
 * Para forzar una fecha específica (yyyyMMdd):
 *   WOLKVOX_FECHA=20260510 node scripts/test-wolkvox-diagnostico.js
 */

require('dotenv').config();
const { createPool, listarServidoresAsterisk } = require('../src/shared/ingesta/mcob');
const { decryptTripleDES } = require('../src/shared/ingesta/crypto');

const KEY_CRYPT = process.env.KEY_CRYPT;

// ─── Misma lógica que wolkvox.js ─────────────────────────────────────────────

function horaLima() {
  return parseInt(
    new Date().toLocaleString('en-US', { timeZone: 'America/Lima', hour: 'numeric', hour12: false }), 10
  );
}

function fechaWolkvox(date) {
  return date.toLocaleDateString('en-CA', { timeZone: 'America/Lima' }).replace(/-/g, '');
}

function getTipoYFecha(override) {
  if (override) return { tipo: 0, fecha: override, fuente: 'WOLKVOX_FECHA override manual' };
  const h = horaLima();
  const tipo = h < 12 ? 1 : 2;
  const fecha = tipo === 1
    ? fechaWolkvox(new Date(Date.now() - 86_400_000))
    : fechaWolkvox(new Date());
  return {
    tipo,
    fecha,
    fuente: tipo === 1
      ? `hora Lima ${h}h < 12 → tipo 1 → datos de AYER`
      : `hora Lima ${h}h >= 12 → tipo 2 → datos de HOY`,
  };
}

async function listarLlamadas(host, token, campaignId, fecha) {
  const url = `https://${host}.wolkvox.com/api/v2/reports_manager.php` +
    `?api=campaign_3&campaign_id=${campaignId}&date_ini=${fecha}000000&date_end=${fecha}235959`;
  try {
    const res = await fetch(url, {
      headers: { Accept: 'application/json', 'wolkvox-token': token },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return { ok: false, status: res.status, url };
    const json = await res.json();
    return { ok: true, data: Array.isArray(json.data) ? json.data : [], url };
  } catch (e) {
    return { ok: false, error: e.message, url };
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const SEP = '═'.repeat(52);
  const sep = '─'.repeat(52);

  // ── 1. Fecha y tipo ──
  console.log(`\n${SEP}`);
  console.log('  Diagnóstico Wolkvox — ContactoEficaz');
  console.log(SEP);

  const { tipo, fecha, fuente } = getTipoYFecha(process.env.WOLKVOX_FECHA || '');
  const horaActual = horaLima();

  console.log(`\n  Hora Lima actual : ${horaActual}h`);
  console.log(`  Tipo ejecución   : ${tipo === 0 ? 'override (0)' : tipo}`);
  console.log(`  Fecha objetivo   : ${fecha}  (${fecha.slice(6,8)}/${fecha.slice(4,6)}/${fecha.slice(0,4)})`);
  console.log(`  Lógica aplicada  : ${fuente}`);
  console.log(`  KEY_CRYPT        : ${KEY_CRYPT ? KEY_CRYPT.slice(0,8)+'...' : '⚠  NO CONFIGURADA'}`);
  console.log(`  INGESTA_SOLO_CARGA : ${process.env.INGESTA_SOLO_CARGA}`);

  // ── 2. Conexión BD + servidores ──
  console.log(`\n${sep}`);
  console.log('  BD: servidores Asterisk');
  console.log(sep);
  console.log(`  Servidor : ${process.env.MCOB_DB_SERVER}`);
  console.log(`  Base     : ${process.env.MCOB_DB_DATABASE}`);
  console.log(`  Usuario  : ${process.env.MCOB_DB_USER}`);

  const pool = createPool({
    server:   process.env.MCOB_DB_SERVER,
    database: process.env.MCOB_DB_DATABASE,
    user:     process.env.MCOB_DB_USER,
    pass:     process.env.MCOB_DB_PASS,
  });

  let servidores = [];
  try {
    await pool.connect();
    console.log('\n  Conexión: OK');
    servidores = await listarServidoresAsterisk(pool);
    console.log(`  Servidores encontrados: ${servidores.length}`);
    if (!servidores.length) {
      console.log('  ⚠  SP_LISTAR_ASTERISK_SERVIDOR devolvió 0 filas');
    }
    servidores.forEach((s, i) => {
      const activo = tipo === 0 || s.TIM_EJE_SI === tipo;
      console.log(
        `\n  [${i+1}] Host       : ${s.AMI_HOST_VC}` +
        `\n       Token      : ${s.AMI_PASS_VC ? s.AMI_PASS_VC.slice(0,6)+'...' : '(vacío)'}` +
        `\n       TIM_EJE_SI : ${s.TIM_EJE_SI}  ${activo ? '✓ activo para este turno' : '○ omitido este turno'}` +
        `\n       Campañas   : ${s.CAMP_MIN_PROV_EXT} → ${s.CAMP_MAX_PROV_EXT} (${s.CAMP_MAX_PROV_EXT - s.CAMP_MIN_PROV_EXT + 1} total)`
      );
    });
  } catch (err) {
    console.error('\n  ✗ Error BD:', err.message);
    if (err.originalError) console.error('    Detalle:', err.originalError.message);
    await pool.close().catch(() => {});
    process.exit(1);
  } finally {
    await pool.close().catch(() => {});
  }

  // ── 3. API Wolkvox ──
  const activos = tipo === 0 ? servidores : servidores.filter(s => s.TIM_EJE_SI === tipo);
  if (!activos.length) {
    console.log(`\n  ⚠  Ningún servidor tiene TIM_EJE_SI=${tipo}. Sin llamadas para este turno.`);
    console.log(`     Para forzar todos los servidores: WOLKVOX_FECHA=<yyyyMMdd>\n`);
    return;
  }

  for (const srv of activos) {
    console.log(`\n${sep}`);
    console.log(`  API: ${srv.AMI_HOST_VC}.wolkvox.com`);
    console.log(sep);

    let totalSrv = 0;
    let primerRegistro = null;
    const MAX_CAMP_PRUEBA = 5; // solo probamos las primeras 5 campañas
    const campMax = Math.min(srv.CAMP_MIN_PROV_EXT + MAX_CAMP_PRUEBA - 1, srv.CAMP_MAX_PROV_EXT);

    for (let camp = srv.CAMP_MIN_PROV_EXT; camp <= campMax; camp++) {
      const r = await listarLlamadas(srv.AMI_HOST_VC, srv.AMI_PASS_VC, String(camp), fecha);
      if (!r.ok) {
        console.log(`  campaña ${camp}: ✗ ${r.status ? 'HTTP '+r.status : r.error}`);
        continue;
      }
      const n = r.data.length;
      console.log(`  campaña ${camp}: ${n} registro${n !== 1 ? 's' : ''}`);
      totalSrv += n;
      if (!primerRegistro && n > 0) primerRegistro = { camp, item: r.data[0] };
    }

    if (campMax < srv.CAMP_MAX_PROV_EXT) {
      console.log(`  ... (solo primeras ${MAX_CAMP_PRUEBA} de ${srv.CAMP_MAX_PROV_EXT - srv.CAMP_MIN_PROV_EXT + 1} campañas)`);
    }
    console.log(`  Total (${MAX_CAMP_PRUEBA} campañas): ${totalSrv} registros`);

    // ── 4. Descifrado del primer registro ──
    if (primerRegistro) {
      const { camp, item } = primerRegistro;
      console.log(`\n  Primer registro (campaña ${camp}):`);
      console.log(`    result  : ${item.result}`);
      console.log(`    date    : ${item.date}`);
      console.log(`    opt11   : ${item.opt11}  ← idCampana (sin cifrar)`);
      console.log(`    opt12   : ${(item.opt12||'').slice(0,20)}...  ← CODCLIENTE (cifrado)`);
      console.log(`    opt1    : ${(item.opt1||'').slice(0,20)}...  ← CODTELEFONO (cifrado)`);
      console.log(`    telephone: ${item.telephone}`);

      if (!KEY_CRYPT) {
        console.log('\n  ⚠  KEY_CRYPT no configurada — no se puede descifrar.');
      } else {
        try {
          const raw12 = decodeURIComponent((item.opt12 || '').trim());
          const raw1  = decodeURIComponent((item.opt1  || '').trim());
          const idCliente  = raw12 ? Number(decryptTripleDES(raw12, KEY_CRYPT)) : 0;
          const idTelefono = raw1  ? Number(decryptTripleDES(raw1,  KEY_CRYPT)) : 0;
          console.log('\n  Descifrado:');
          console.log(`    idCliente  : ${idCliente}  ${idCliente > 0 ? '✓' : '⚠ resultado 0 — verificar KEY_CRYPT o valor cifrado'}`);
          console.log(`    idTelefono : ${idTelefono}  ${idTelefono > 0 ? '✓' : '⚠ resultado 0'}`);

          // Validar formato fecha
          const d = String(item.date || '');
          const fecGesVc = d.length >= 10 ? `${d.slice(8,10)}/${d.slice(5,7)}/${d.slice(0,4)}` : '(sin fecha)';
          const horGesVc = d.length >= 19 ? d.slice(11, 19) : '(sin hora)';
          console.log(`    fecGesVc   : ${fecGesVc}  ← formato dd/MM/yyyy`);
          console.log(`    horGesVc   : ${horGesVc}  ← formato HH:mm:ss`);
        } catch (e) {
          console.log(`\n  ✗ Error descifrado: ${e.message}`);
        }
      }
    } else {
      console.log('\n  (sin registros en las primeras campañas para esta fecha)');
    }
  }

  console.log(`\n${SEP}`);
  console.log('  Diagnóstico completo. Sin escrituras realizadas.');
  console.log(`${SEP}\n`);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
