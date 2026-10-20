require('dotenv').config();
const fs   = require('fs');
const path = require('path');
const { decryptTripleDES }           = require('../../../shared/ingesta/crypto');
const { createPool, limpiarTmpGestiones,
        bulkRegistrarTmpGestiones,
        registrarGestiones,
        dedupGestionesVarios }       = require('../../../shared/ingesta/mcob');
const { notificarEjecucion }         = require('../../../shared/ingesta/notificar');
const { acquireLock }                = require('../../../shared/ingesta/lock');
const { hostDe, parsearRespuesta, resumirServidores, parchearServidor } = require('./ipb-servidores');

const DOWNLOADS_DIR = path.resolve(process.env.DOWNLOAD_DIR || './descargas');
const KEY_CRYPT     = process.env.KEY_CRYPT;
const FETCH_TIMEOUT_MS = parseInt(process.env.IPB_FETCH_TIMEOUT_MS || '120000', 10); // 2 min por servidor
const MAX_REINTENTOS   = parseInt(process.env.IPB_MAX_REINTENTOS || '2', 10);
const BACKOFF_MS       = parseInt(process.env.IPB_BACKOFF_MS || '3000', 10);
// Mismo candado que Wolkvox: ambos limpian/cargan CARGA.TMP_GESTION y no pueden solaparse.
const LOCK_PATH    = path.join(DOWNLOADS_DIR, 'wolkvox.lock');
const LOCK_TTL_MS  = parseInt(process.env.WOLKVOX_LOCK_TTL_MS || '1200000', 10);
const LOCK_WAIT_MS = parseInt(process.env.WOLKVOX_LOCK_WAIT_MS || '900000', 10);
const LOCK_POLL_MS = parseInt(process.env.WOLKVOX_LOCK_POLL_MS || '5000', 10);

const LAST_FILE = path.join(DOWNLOADS_DIR, 'last_run_ipbusiness.json');
const HIST_FILE = path.join(DOWNLOADS_DIR, 'history_ipbusiness.json');

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ─── Fecha ────────────────────────────────────────────────────────────────────

function getFecha(override) {
  if (override) return override;
  // API espera yyyy-MM-dd
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' });
}

// yyyy-MM-dd → dd/MM/yyyy (formato que espera dedupGestionesVarios)
function fechaDDMMYYYY(fecha) {
  const [y, m, d] = fecha.split('-');
  return `${d}/${m}/${y}`;
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
  const res = await fetch(`${url}?f=${fecha}`, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return parsearRespuesta(await res.text()); // Array<EntidadIPB>
}

// Descarga un servidor con reintentos. Nunca lanza: devuelve el detalle del servidor
// (sin la URL, que lleva token) y los registros válidos parseados.
async function procesarServidor(url, fecha) {
  const host = hostDe(url);
  let ultimoError = null;
  for (let intento = 1; intento <= MAX_REINTENTOS + 1; intento++) {
    try {
      const llamadas = await listarLlamadas(url, fecha);
      const registros = [];
      for (const item of llamadas) {
        const reg = parsearLlamada(item);
        if (reg) registros.push(reg);
      }
      console.log(`[ipbusiness] ${host} → ${llamadas.length} registros (${registros.length} válidos)`);
      return {
        detalle: { host, resultado: llamadas.length ? 'ok' : 'vacio', raw: llamadas.length,
                   validos: registros.length, intentos: intento, error: null },
        registros,
      };
    } catch (err) {
      ultimoError = err.name === 'TimeoutError' ? `timeout ${FETCH_TIMEOUT_MS / 1000}s` : err.message;
      console.error(`[ipbusiness] ${host} intento ${intento} error: ${ultimoError}`);
      if (intento <= MAX_REINTENTOS) await sleep(BACKOFF_MS * intento);
    }
  }
  return {
    detalle: { host, resultado: 'error', raw: 0, validos: 0, intentos: MAX_REINTENTOS + 1, error: ultimoError },
    registros: [],
  };
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

// ─── BD ───────────────────────────────────────────────────────────────────────

function nuevoPool() {
  return createPool({
    server:   process.env.MCOB_DB_SERVER,
    database: process.env.MCOB_DB_DATABASE,
    user:     process.env.MCOB_DB_USER,
    pass:     process.env.MCOB_DB_PASS,
  });
}

// Carga a TMP_GESTION + SP + dedup de la fecha. Devuelve duplicados inactivados (o null).
// El SP no evita duplicados: sin el dedup, re-ejecutar o reintentar un servidor duplica.
async function cargarEnBD(pool, registros, fecha, estado) {
  estado.fase = 'limpiar';
  await limpiarTmpGestiones(pool);
  estado.fase = 'bulk_insert';
  await bulkRegistrarTmpGestiones(pool, registros);

  if (process.env.INGESTA_SOLO_CARGA === 'true') {
    console.log('[ipbusiness] INGESTA_SOLO_CARGA=true — SP_EJECUTAR omitido, TMP_GESTION llena para revisión');
    return null;
  }
  estado.fase = 'ejecutar';
  await registrarGestiones(pool);
  estado.bdRegistrado = true;

  estado.fase = 'dedup_sql';
  const inact = await dedupGestionesVarios(pool, fechaDDMMYYYY(fecha));
  console.log(`[ipbusiness] dedup SQL: ${inact} duplicados inactivados (${fechaDDMMYYYY(fecha)})`);
  return inact;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDuracion(ms) {
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${s % 60} s`;
}

function leerJson(file, def) {
  try { if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8')); } catch {}
  return def;
}

// ─── Modo dirigido: reintenta un solo servidor (botón del panel) ──────────────
// No crea una corrida nueva: parchea el detalle del servidor en la corrida de esa fecha.

async function ejecutarDirigido(host, fecha) {
  const resumen = { status: 'ok', modo: 'dirigido', host, fecha, servidor: null, error: null };
  const url = getUrls().find(u => hostDe(u) === host);
  if (!url) {
    resumen.status = 'error';
    resumen.error  = `Servidor ${host} no está en IPB_URL`;
    return resumen;
  }

  const { detalle, registros } = await procesarServidor(url, fecha);
  resumen.servidor = detalle;

  if (registros.length) {
    const pool = nuevoPool();
    const fase = {};
    try {
      await pool.connect();
      resumen.dupInactivados = await cargarEnBD(pool, registros, fecha, fase);
    } catch (err) {
      // Falla al registrar en BD: el servidor sigue pendiente de reintento.
      detalle.resultado = 'error';
      detalle.error     = `BD (${fase.fase}): ${err.message}`;
      resumen.status    = 'error';
      resumen.error     = detalle.error;
    } finally {
      try { await pool.close(); } catch {}
    }
  }
  if (detalle.resultado === 'error') { resumen.status = 'error'; resumen.error = resumen.error || detalle.error; }

  const { history, patched } = parchearServidor(leerJson(HIST_FILE, []), { fechaReporte: fecha, servidor: detalle });
  if (patched) {
    fs.writeFileSync(HIST_FILE, JSON.stringify(history, null, 2));
    const last = leerJson(LAST_FILE, null);
    if (last && last.fechaReporte === fecha) {
      const nuevo = history.find(e => e.fechaReporte === fecha);
      fs.writeFileSync(LAST_FILE, JSON.stringify(nuevo, null, 2));
    }
  }
  console.log(`[ipbusiness] dirigido ${host}: ${detalle.resultado}, ${detalle.validos} válidos`);
  return resumen;
}

// ─── Corrida completa ─────────────────────────────────────────────────────────

async function ejecutarCompleto() {
  const t0 = Date.now();
  const estado = {
    status:           'ok',
    timestamp:        new Date().toISOString(),
    fechaReporte:     null,
    tamaño:           null,
    totalServidores:  0,
    totalRegistros:   0,
    registrosValidos: 0,
    servidores:       [],
    bdRegistrado:     false,
    dupInactivados:   null,
    duracionMs:       null,
    duracion:         null,
    fase:             'inicio',
    error:            null,
  };

  const pool = nuevoPool();

  try {
    const fecha = getFecha(process.env.IPB_FECHA || '');
    const urls  = getUrls();
    estado.fechaReporte    = fecha;
    estado.totalServidores = urls.length;
    console.log(`[ipbusiness] fecha=${fecha}, servidores=${urls.length}`);

    if (!urls.length) throw new Error('IPB_URL no configurado');

    const registros = [];
    for (const url of urls) {
      estado.fase = `fetch_${hostDe(url)}`;
      const r = await procesarServidor(url, fecha);
      estado.servidores.push(r.detalle);
      registros.push(...r.registros);
    }

    const resumen = resumirServidores(estado.servidores);
    estado.totalRegistros   = resumen.totalRegistros;
    estado.registrosValidos = resumen.registrosValidos;
    estado.tamaño = `${resumen.registrosValidos} registros válidos`;
    console.log(`[ipbusiness] ${resumen.registrosValidos} válidos / ${resumen.totalRegistros} total`);

    if (registros.length > 0) {
      await pool.connect();
      estado.dupInactivados = await cargarEnBD(pool, registros, fecha, estado);
    }

    estado.fase   = 'completado';
    estado.status = resumen.status;
    estado.error  = resumen.error;
    console.log(`[ipbusiness] Procesamiento terminado — status=${estado.status}`);

  } catch (err) {
    estado.status = 'error';
    estado.error  = err.message;
    console.error(`[ipbusiness] ERROR (fase=${estado.fase}): ${err.message}`);
  } finally {
    try { await pool.close(); } catch {}
    estado.duracionMs = Date.now() - t0;
    estado.duracion   = formatDuracion(estado.duracionMs);

    // Regularizar una fecha pasada no debe tapar en la tarjeta la corrida más reciente.
    const last = leerJson(LAST_FILE, null);
    if (!last || !last.fechaReporte || !estado.fechaReporte || estado.fechaReporte >= last.fechaReporte) {
      fs.writeFileSync(LAST_FILE, JSON.stringify(estado, null, 2));
    }
    let hist = leerJson(HIST_FILE, []);
    hist.unshift(estado);
    if (hist.length > 90) hist = hist.slice(0, 90);
    fs.writeFileSync(HIST_FILE, JSON.stringify(hist, null, 2));

    // En regularización (varias fechas seguidas) solo se notifica si hubo error.
    if (process.env.IPB_REGULARIZAR !== 'true' || estado.status !== 'ok') {
      try { await notificarEjecucion(estado, 'IPBusiness — Ingesta Llamadas'); } catch (e) {
        console.error(`[ipbusiness] notificar error: ${e.message}`);
      }
    }
  }
  return estado;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const onlyHost = process.env.IPB_ONLY_HOST;
  const dirigido = !!(onlyHost && process.env.IPB_FECHA);
  fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });

  console.log(`[ipbusiness] esperando candado (${dirigido ? 'dirigido' : 'normal'})...`);
  const release = await acquireLock({
    lockPath: LOCK_PATH, ttlMs: LOCK_TTL_MS, pollMs: LOCK_POLL_MS, maxWaitMs: LOCK_WAIT_MS,
    mode: dirigido ? 'dirigido' : 'normal',
    label: dirigido ? `ipbusiness ${onlyHost}` : 'ipbusiness',
  });
  let salida;
  try {
    salida = dirigido
      ? await ejecutarDirigido(onlyHost, process.env.IPB_FECHA)
      : await ejecutarCompleto();
  } catch (err) {
    salida = { status: 'error', modo: dirigido ? 'dirigido' : 'normal', error: err.message };
  } finally {
    try { release(); } catch {}
  }
  process.stdout.write(`\n${JSON.stringify(salida)}\n`);
  process.exit(salida.status === 'ok' ? 0 : 1);
}

if (require.main === module) {
  main().catch(err => { console.error('Fatal:', err); process.exit(1); });
}

module.exports = { main, parsearLlamada, fechaDDMMYYYY };
