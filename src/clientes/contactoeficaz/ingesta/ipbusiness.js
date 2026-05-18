require('dotenv').config();
const fs   = require('fs');
const path = require('path');
const { decryptTripleDES }           = require('../../../shared/ingesta/crypto');
const { createPool, limpiarTmpGestiones,
        bulkRegistrarTmpGestiones,
        registrarGestiones }         = require('../../../shared/ingesta/mcob');
const { notificarEjecucion }         = require('../../../shared/ingesta/notificar');

const DOWNLOADS_DIR = path.resolve(process.env.DOWNLOAD_DIR || './descargas');
const KEY_CRYPT     = process.env.KEY_CRYPT;

// ─── Fecha ────────────────────────────────────────────────────────────────────

function getFecha(override) {
  if (override) return override;
  // API espera yyyy-MM-dd
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' });
}

// ─── URLs (soporta una o varias separadas por coma) ───────────────────────────

function getUrls() {
  return (process.env.IPB_URL || '')
    .split(',')
    .map(u => u.trim().replace(/[?&]f=$/, '')) // normaliza ?f= o &f= al final
    .filter(Boolean);
}

// ─── API IPBusiness ───────────────────────────────────────────────────────────

async function listarLlamadas(url, fecha) {
  const fullUrl = `${url}?f=${fecha}`;
  const res = await fetch(fullUrl);
  if (!res.ok) throw new Error(`HTTP ${res.status} en ${fullUrl}`);
  return res.json(); // Array<EntidadIPB>
}

// ─── Parseo y descifrado ──────────────────────────────────────────────────────

function parsearLlamada(item) {
  let idCliente = 0, idTelefono = 0;
  try {
    if ((item.CODCLIENTE  || '').trim()) idCliente  = Number(decryptTripleDES(item.CODCLIENTE.trim(),  KEY_CRYPT));
    if ((item.CODTELEFONO || '').trim()) idTelefono = Number(decryptTripleDES(item.CODTELEFONO.trim(), KEY_CRYPT));
  } catch { return null; }

  const codCampana   = Number(item.CAMPANA);
  const codResultado = Number(item.RESULTADO);

  if (!(codCampana > 0 && idCliente > 0 && idTelefono > 0 && codResultado > 0)) return null;

  const tipResSi = codResultado;
  const tipSolSi = Number(item.SOLUCION) || 0;
  return {
    idConfBi:       codCampana,
    idClieBi:       idCliente,
    idTelBi:        idTelefono,
    fecGesVc:       item.FECHA       || '',
    horGesVc:       item.HORA        || '',
    tipResSi,
    tipSolSi,
    nroTelVc:       item.TELEFONO    || '',
    desObsVc:       item.OBSERVACION || '',
    rutAudVc:       item.AUDIO       || '',
    tipGesSi:       1,
    idTipResModSi:  tipResSi,
    idTipSolModSi:  tipSolSi,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDuracion(ms) {
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${s % 60} s`;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const t0 = Date.now();
  const estado = {
    status:           'ok',
    timestamp:        new Date().toISOString(),
    fechaReporte:     null,
    tamaño:           null,
    totalServidores:  0,
    totalRegistros:   0,
    registrosValidos: 0,
    duracionMs:       null,
    duracion:         null,
    fase:             'inicio',
    error:            null,
  };

  const pool = createPool({
    server:   process.env.MCOB_DB_SERVER,
    database: process.env.MCOB_DB_DATABASE,
    user:     process.env.MCOB_DB_USER,
    pass:     process.env.MCOB_DB_PASS,
  });

  try {
    await pool.connect();

    const fecha = getFecha(process.env.IPB_FECHA || '');
    const urls  = getUrls();
    estado.fechaReporte    = fecha;
    estado.totalServidores = urls.length;
    console.log(`[ipbusiness] fecha=${fecha}, servidores=${urls.length}`);

    if (!urls.length) throw new Error('IPB_URL no configurado');

    estado.fase = 'limpiar';
    await limpiarTmpGestiones(pool);

    const registros = [];
    for (const url of urls) {
      estado.fase = `fetch_${url.match(/\/\/([\w.]+)/)?.[1] || 'srv'}`;
      try {
        const llamadas = await listarLlamadas(url, fecha);
        estado.totalRegistros += llamadas.length;
        console.log(`[ipbusiness] ${url.match(/\/\/([\w.]+)/)?.[1]} → ${llamadas.length} registros`);
        for (const item of llamadas) {
          const reg = parsearLlamada(item);
          if (reg) registros.push(reg);
        }
      } catch (err) {
        console.error(`[ipbusiness] ${url} error: ${err.message}`);
      }
    }

    estado.registrosValidos = registros.length;
    estado.tamaño = `${registros.length} registros válidos`;
    console.log(`[ipbusiness] ${registros.length} válidos / ${estado.totalRegistros} total`);

    if (registros.length > 0) {
      estado.fase = 'bulk_insert';
      await bulkRegistrarTmpGestiones(pool, registros);

      if (process.env.INGESTA_SOLO_CARGA === 'true') {
        console.log('[ipbusiness] INGESTA_SOLO_CARGA=true — SP_EJECUTAR omitido, TMP_GESTION llena para revisión');
      } else {
        estado.fase = 'ejecutar';
        await registrarGestiones(pool);
      }
    }

    estado.fase = 'completado';
    console.log('[ipbusiness] Procesamiento terminado correctamente');

  } catch (err) {
    estado.status = 'error';
    estado.error  = err.message;
    console.error(`[ipbusiness] ERROR (fase=${estado.fase}): ${err.message}`);
  } finally {
    try { await pool.close(); } catch {}
    estado.duracionMs = Date.now() - t0;
    estado.duracion   = formatDuracion(estado.duracionMs);

    fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });
    fs.writeFileSync(
      path.join(DOWNLOADS_DIR, 'last_run_ipbusiness.json'),
      JSON.stringify(estado, null, 2)
    );

    const histFile = path.join(DOWNLOADS_DIR, 'history_ipbusiness.json');
    let hist = [];
    try { if (fs.existsSync(histFile)) hist = JSON.parse(fs.readFileSync(histFile, 'utf8')); } catch {}
    hist.unshift(estado);
    if (hist.length > 90) hist = hist.slice(0, 90);
    fs.writeFileSync(histFile, JSON.stringify(hist, null, 2));

    try { await notificarEjecucion(estado, 'IPBusiness — Ingesta Llamadas'); } catch (e) {
      console.error(`[ipbusiness] notificar error: ${e.message}`);
    }

    process.stdout.write(`\n${JSON.stringify(estado)}\n`);
  }

  process.exit(estado.status === 'ok' ? 0 : 1);
}

if (require.main === module) {
  main().catch(err => { console.error('Fatal:', err); process.exit(1); });
}

module.exports = { main };
