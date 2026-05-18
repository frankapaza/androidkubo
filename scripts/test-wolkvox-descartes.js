/**
 * Muestra desglose de registros descartados de Wolkvox por motivo.
 * Sin escrituras a BD. Usa la misma lógica que wolkvox.js.
 *
 * Uso:
 *   node scripts/test-wolkvox-descartes.js
 *   WOLKVOX_FECHA=20260511 node scripts/test-wolkvox-descartes.js
 */

require('dotenv').config();
const { createPool, listarServidoresAsterisk } = require('../src/shared/ingesta/mcob');
const { decryptTripleDES } = require('../src/shared/ingesta/crypto');

const KEY_CRYPT = process.env.KEY_CRYPT;

const HOMOLOGACION = {
  'ABANDON':        { tipResSi: 47, tipSolSi: 0 },
  'ANSWER-MACHINE': { tipResSi: 46, tipSolSi: 0 },
  'BUSY':           { tipResSi: 47, tipSolSi: 0 },
  'NO-ANSWER':      { tipResSi: 47, tipSolSi: 0 },
};

function horaLima() {
  return parseInt(new Date().toLocaleString('en-US', { timeZone: 'America/Lima', hour: 'numeric', hour12: false }), 10);
}
function fechaWolkvox(date) {
  return date.toLocaleDateString('en-CA', { timeZone: 'America/Lima' }).replace(/-/g, '');
}
function getTipoYFecha(override) {
  if (override) return { tipo: 0, fecha: override };
  const h = horaLima();
  const tipo = h < 12 ? 1 : 2;
  return { tipo, fecha: tipo === 1 ? fechaWolkvox(new Date(Date.now() - 86_400_000)) : fechaWolkvox(new Date()) };
}

async function listarLlamadas(host, token, campaignId, fecha) {
  const url = `https://${host}.wolkvox.com/api/v2/reports_manager.php` +
    `?api=campaign_3&campaign_id=${campaignId}&date_ini=${fecha}000000&date_end=${fecha}235959`;
  try {
    const res = await fetch(url, { headers: { Accept: 'application/json', 'wolkvox-token': token }, signal: AbortSignal.timeout(20000) });
    if (!res.ok) return [];
    const json = await res.json();
    return Array.isArray(json.data) ? json.data : [];
  } catch { return []; }
}

async function main() {
  const { tipo, fecha } = getTipoYFecha(process.env.WOLKVOX_FECHA || '');
  console.log(`\nAnálisis descartes Wolkvox — fecha ${fecha} (tipo ${tipo || 'override'})\n`);

  const pool = createPool({
    server: process.env.MCOB_DB_SERVER, database: process.env.MCOB_DB_DATABASE,
    user: process.env.MCOB_DB_USER, pass: process.env.MCOB_DB_PASS,
  });
  await pool.connect();
  const servidores = await listarServidoresAsterisk(pool);
  await pool.close();

  const activos = tipo === 0 ? servidores : servidores.filter(s => s.TIM_EJE_SI === tipo);

  // Contadores por motivo
  const motivos = {
    hora_fuera_rango: { count: 0, samples: [] },
    sin_homologacion: { count: 0, samples: [] },
    descifrado_fallo: { count: 0, samples: [] },
    id_invalido:      { count: 0, samples: [] },
  };
  let totalRegistros = 0;
  let validos = 0;

  // Distribución por hora (todos los registros)
  const porHora = {};

  for (const srv of activos) {
    console.log(`Procesando ${srv.AMI_HOST_VC} (campañas ${srv.CAMP_MIN_PROV_EXT}–${srv.CAMP_MAX_PROV_EXT})...`);
    for (let camp = srv.CAMP_MIN_PROV_EXT; camp <= srv.CAMP_MAX_PROV_EXT; camp++) {
      const llamadas = await listarLlamadas(srv.AMI_HOST_VC, srv.AMI_PASS_VC, String(camp), fecha);
      totalRegistros += llamadas.length;

      for (const item of llamadas) {
        const d = String(item.date || '');
        const horGesVc = d.length >= 19 ? d.slice(11, 19) : '';
        const hora = horGesVc ? parseInt(horGesVc.slice(0, 2), 10) : -1;

        // Distribución horaria (todos los registros, sin filtro)
        const hKey = hora >= 0 ? String(hora).padStart(2, '0') + 'h' : 'sin_hora';
        porHora[hKey] = (porHora[hKey] || 0) + 1;

        // Clasificar descarte
        const opt12 = (item.opt12 || '').trim();
        const opt1  = (item.opt1  || '').trim();
        const opt11 = (item.opt11 || '').trim();

        let idCliente = 0, idTelefono = 0, descifradoOk = true;
        try {
          if (opt12) idCliente  = Number(decryptTripleDES(decodeURIComponent(opt12), KEY_CRYPT));
          if (opt1)  idTelefono = Number(decryptTripleDES(decodeURIComponent(opt1),  KEY_CRYPT));
        } catch { descifradoOk = false; }

        const codCampana = Number(opt11);
        const homol = HOMOLOGACION[item.result];

        const sample = { camp, result: item.result, date: item.date, telephone: item.telephone };

        if (!descifradoOk) {
          motivos.descifrado_fallo.count++;
          if (motivos.descifrado_fallo.samples.length < 10) motivos.descifrado_fallo.samples.push(sample);
        } else if (!(codCampana > 0 && idCliente > 0 && idTelefono > 0)) {
          motivos.id_invalido.count++;
          if (motivos.id_invalido.samples.length < 10) motivos.id_invalido.samples.push({ ...sample, codCampana, idCliente, idTelefono });
        } else if (!homol) {
          motivos.sin_homologacion.count++;
          if (motivos.sin_homologacion.samples.length < 10) motivos.sin_homologacion.samples.push({ ...sample, hora });
        } else if (hora < 7 || hora >= 21) {
          motivos.hora_fuera_rango.count++;
          if (motivos.hora_fuera_rango.samples.length < 5) motivos.hora_fuera_rango.samples.push({ ...sample, hora });
        } else {
          validos++;
        }
      }
    }
  }

  const totalDescartes = totalRegistros - validos;

  // ── Resumen ──
  console.log('\n══ RESUMEN ═══════════════════════════════════════');
  console.log(`  Total registros API   : ${totalRegistros.toLocaleString()}`);
  console.log(`  Válidos               : ${validos.toLocaleString()}`);
  console.log(`  Total descartados     : ${totalDescartes.toLocaleString()}`);
  console.log('\n── Descartes por motivo ──────────────────────────');
  console.log(`  Hora fuera de rango   : ${motivos.hora_fuera_rango.count.toLocaleString()}`);
  console.log(`  Sin homologación      : ${motivos.sin_homologacion.count.toLocaleString()}`);
  console.log(`  Descifrado fallido    : ${motivos.descifrado_fallo.count.toLocaleString()}`);
  console.log(`  ID inválido (0)       : ${motivos.id_invalido.count.toLocaleString()}`);

  // ── Distribución horaria ──
  console.log('\n── Distribución por hora (todos los registros) ───');
  const horas = Object.keys(porHora).sort();
  for (const h of horas) {
    const count = porHora[h];
    const pct = ((count / totalRegistros) * 100).toFixed(1);
    const bar = '█'.repeat(Math.round(pct / 2));
    const fuera = h !== 'sin_hora' && (parseInt(h) < 7 || parseInt(h) >= 21);
    console.log(`  ${h.padEnd(8)} ${String(count).padStart(7)}  ${pct.padStart(5)}%  ${bar}${fuera ? '  ← fuera de rango' : ''}`);
  }

  // ── Muestras por motivo ──
  if (motivos.hora_fuera_rango.samples.length) {
    console.log('\n── Muestra: hora fuera de rango ──────────────────');
    motivos.hora_fuera_rango.samples.forEach(s =>
      console.log(`  camp ${s.camp} | hora ${s.hora}h | result: ${s.result} | date: ${s.date} | tel: ${s.telephone}`)
    );
  }
  if (motivos.sin_homologacion.samples.length) {
    console.log('\n── Muestra: sin homologación (10 ejemplos) ───────');
    console.log(`  ${'camp'.padEnd(7)} ${'result'.padEnd(16)} ${'fecha'.padEnd(12)} ${'hora'.padEnd(10)} telefono`);
    console.log('  ' + '─'.repeat(60));
    motivos.sin_homologacion.samples.forEach(s => {
      const d = String(s.date || '');
      const fecha = d.length >= 10 ? `${d.slice(8,10)}/${d.slice(5,7)}/${d.slice(0,4)}` : '—';
      const hora  = d.length >= 19 ? d.slice(11, 19) : '—';
      console.log(`  ${String(s.camp).padEnd(7)} ${(s.result||'—').padEnd(16)} ${fecha.padEnd(12)} ${hora.padEnd(10)} ${s.telephone||'—'}`);
    });
  }

  console.log('\n══════════════════════════════════════════════════\n');
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
