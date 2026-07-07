require('dotenv').config();
const fs   = require('fs');
const path = require('path');
const { decryptTripleDES }           = require('../../../shared/ingesta/crypto');
const { createPool, limpiarTmpGestiones,
        bulkRegistrarTmpGestiones,
        listarServidoresConCampanas,
        registrarGestiones,
        dedupGestionesVarios }       = require('../../../shared/ingesta/mcob');
const { intentarCampana, fetchCampanaConReintento, sleep } = require('../../../shared/ingesta/wolkvox-fetch');
const { construirReconciliacion, calcularStatus, esDiaHabilLima, parchearReconciliacion } = require('./reconciliacion');
const { notificarEjecucion }         = require('../../../shared/ingesta/notificar');

const DOWNLOADS_DIR = path.resolve(process.env.DOWNLOAD_DIR || './descargas');
const KEY_CRYPT     = process.env.KEY_CRYPT;
const MAX_REINTENTOS   = parseInt(process.env.WOLKVOX_MAX_REINTENTOS || '2', 10);
const BACKOFF_MS       = parseInt(process.env.WOLKVOX_BACKOFF_MS || '1500', 10);
const FETCH_TIMEOUT_MS = parseInt(process.env.WOLKVOX_FETCH_TIMEOUT_MS || '20000', 10);

// ─── Tiempo Lima ────────────────────────────────────────────────────────────

function horaLima() {
  return parseInt(
    new Date().toLocaleString('en-US', { timeZone: 'America/Lima', hour: 'numeric', hour12: false }),
    10
  );
}

function fechaWolkvox(date) {
  return date.toLocaleDateString('en-CA', { timeZone: 'America/Lima' }).replace(/-/g, '');
}

function getTipoYFecha(override) {
  if (override) return { tipo: 0, fecha: override }; // override → todos los servidores
  const h = horaLima();
  const tipo = h < 12 ? 1 : 2;
  const fecha = tipo === 1
    ? fechaWolkvox(new Date(Date.now() - 86_400_000)) // ayer
    : fechaWolkvox(new Date());                        // hoy
  return { tipo, fecha };
}

// ─── Homologación de resultados ──────────────────────────────────────────────

const HOMOLOGACION = {
  'ABANDON':        { tipResSi: 47, tipSolSi: 0 },
  'ANSWER-MACHINE': { tipResSi: 46, tipSolSi: 0 },
  'BUSY':           { tipResSi: 47, tipSolSi: 0 },
  'NO-ANSWER':      { tipResSi: 47, tipSolSi: 0 },
};

// ─── API Wolkvox ─────────────────────────────────────────────────────────────

async function listarLlamadas(host, token, campaignId, fecha) {
  const url = `https://${host}.wolkvox.com/api/v2/reports_manager.php` +
    `?api=campaign_3&campaign_id=${campaignId}&date_ini=${fecha}000000&date_end=${fecha}235959`;
  const res = await fetch(url, {
    headers: { Accept: 'application/json', 'wolkvox-token': token },
  });
  if (!res.ok) {
    console.error(`  campaña ${campaignId} HTTP ${res.status}: ${res.statusText}`);
    return [];
  }
  const json = await res.json();
  if (json.error) {
    console.error(`  campaña ${campaignId} API error: ${json.error}`);
    return [];
  }
  return Array.isArray(json.data) ? json.data : [];
}

// ─── Parseo y descifrado de un registro ─────────────────────────────────────

function parsearLlamada(item) {
  const opt12 = (item.opt12 || '').trim();
  const opt1  = (item.opt1  || '').trim();
  const opt11 = (item.opt11 || '').trim();

  let idCliente = 0, idTelefono = 0;
  try {
    if (opt12) idCliente  = Number(decryptTripleDES(decodeURIComponent(opt12), KEY_CRYPT));
    if (opt1)  idTelefono = Number(decryptTripleDES(decodeURIComponent(opt1),  KEY_CRYPT));
  } catch { return null; }

  const codCampana = Number(opt11);
  if (!(codCampana > 0 && idCliente > 0 && idTelefono > 0)) return null;

  const homol = HOMOLOGACION[item.result];
  if (!homol) return null; // ANSWER u otros → sin homologación, se omiten

  // "2025-04-03 12:28:00" → dd/MM/yyyy + HH:mm:ss
  const d = String(item.date || '');
  const fecGesVc = d.length >= 10 ? `${d.slice(8,10)}/${d.slice(5,7)}/${d.slice(0,4)}` : '';
  const horGesVc = d.length >= 19 ? d.slice(11, 19) : '';

  // Solo se aceptan llamadas dentro del horario operativo: 07:00 – 20:59
  const hora = horGesVc ? parseInt(horGesVc.slice(0, 2), 10) : -1;
  if (hora < 7 || hora >= 21) return null;

  return {
    idConfBi:       codCampana,
    idClieBi:       idCliente,
    idTelBi:        idTelefono,
    fecGesVc,
    horGesVc,
    tipResSi:       homol.tipResSi,
    tipSolSi:       homol.tipSolSi,
    nroTelVc:       item.telephone || '',
    desObsVc:       item.result    || '',
    rutAudVc:       '',
    tipGesSi:       1,
    idTipResModSi:  homol.tipResSi,
    idTipSolModSi:  homol.tipSolSi,
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDuracion(ms) {
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${s % 60} s`;
}

function fechaReporteDisplay(yyyymmdd) {
  return `${yyyymmdd.slice(6,8)}/${yyyymmdd.slice(4,6)}/${yyyymmdd.slice(0,4)}`;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

// ─── Modo dirigido: re-ejecuta solo campañas puntuales de un servidor ─────────
// Usado por el botón "Reintentar pendientes" del panel. No pasa por el flujo diario
// (no reescribe last_run/history como una corrida completa); parchea la reconciliación.
async function ejecutarDirigido(pool, { host, user, camps, fecha }) {
  const resumen = { status: 'ok', modo: 'dirigido', host, user, fecha, recuperadas: [], aunPendientes: [] };

  // Obtener token del servidor desde el SP companion
  const servidores = await listarServidoresConCampanas(pool);
  const srv = servidores.find(s => s.host === host && s.user === user);
  const token = srv ? srv.token : null;
  if (!token) {
    resumen.status = 'error';
    resumen.error = 'Servidor no encontrado en el SP';
    process.stdout.write(`\n${JSON.stringify(resumen)}\n`);
    return;
  }

  const registros = [];
  for (const camp of camps) {
    const { data, resultado } = await fetchCampanaConReintento({
      intentar: () => intentarCampana({ host, token, camp, fecha, timeoutMs: FETCH_TIMEOUT_MS }),
      maxReintentos: MAX_REINTENTOS, backoffMs: BACKOFF_MS, dormir: sleep,
    });
    let validos = 0;
    for (const item of data) { const reg = parsearLlamada(item); if (reg) { registros.push(reg); validos++; } }
    if (resultado === 'ok' && validos > 0) resumen.recuperadas.push({ camp, validos, raw: data.length });
    else resumen.aunPendientes.push({ camp, resultado });
  }

  // Dedup en memoria (misma clave que el modo normal)
  const seen = new Set();
  const dedup = registros.filter(r => {
    const k = `${r.idConfBi}|${r.idClieBi}|${r.idTelBi}|${r.fecGesVc}|${r.horGesVc}|${r.tipResSi}`;
    if (seen.has(k)) return false; seen.add(k); return true;
  });

  if (dedup.length > 0) {
    await limpiarTmpGestiones(pool);
    await bulkRegistrarTmpGestiones(pool, dedup);
    await registrarGestiones(pool);
  }

  // Parchear la reconciliación persistida (history + last_run si aplica)
  const histFile = path.join(DOWNLOADS_DIR, 'history_wolkvox.json');
  try {
    if (fs.existsSync(histFile) && resumen.recuperadas.length) {
      const hist = JSON.parse(fs.readFileSync(histFile, 'utf8'));
      const { history: h2, patched } = parchearReconciliacion(hist, { fecha, host, user, recuperadas: resumen.recuperadas });
      if (patched) {
        fs.writeFileSync(histFile, JSON.stringify(h2, null, 2));
        const display = `${fecha.slice(6,8)}/${fecha.slice(4,6)}/${fecha.slice(0,4)}`;
        const lastFile = path.join(DOWNLOADS_DIR, 'last_run_wolkvox.json');
        if (fs.existsSync(lastFile)) {
          const last = JSON.parse(fs.readFileSync(lastFile, 'utf8'));
          if (last.fechaReporte === display) {
            const patchedLast = h2.find(e => e.fechaReporte === display);
            if (patchedLast) fs.writeFileSync(lastFile, JSON.stringify(patchedLast, null, 2));
          }
        }
      }
    }
  } catch (e) { console.error('[wolkvox] parcheo reconciliación falló:', e.message); }

  console.log(`[wolkvox] dirigido: recuperadas=${resumen.recuperadas.length}, aún pendientes=${resumen.aunPendientes.length}`);
  process.stdout.write(`\n${JSON.stringify(resumen)}\n`);
}

async function main() {
  // Rama dirigida (botón del panel): procesa solo un servidor + campañas dadas y sale.
  const onlyHost  = process.env.WOLKVOX_ONLY_HOST;
  const onlyUser  = process.env.WOLKVOX_ONLY_USER;
  const onlyCamps = (process.env.WOLKVOX_ONLY_CAMPS || '').split(',').map(s => parseInt(s.trim(), 10)).filter(Boolean);
  if (onlyHost && onlyUser && onlyCamps.length && process.env.WOLKVOX_FECHA) {
    const poolD = createPool({
      server:   process.env.MCOB_DB_SERVER,
      database: process.env.MCOB_DB_DATABASE,
      user:     process.env.MCOB_DB_USER,
      pass:     process.env.MCOB_DB_PASS,
    });
    let code = 0;
    try {
      await poolD.connect();
      await ejecutarDirigido(poolD, { host: onlyHost, user: onlyUser, camps: onlyCamps, fecha: process.env.WOLKVOX_FECHA });
    } catch (err) {
      code = 1;
      process.stdout.write(`\n${JSON.stringify({ status: 'error', modo: 'dirigido', error: err.message })}\n`);
    } finally {
      try { await poolD.close(); } catch {}
    }
    process.exit(code);
  }

  const t0 = Date.now();
  const estado = {
    status:          'ok',
    timestamp:       new Date().toISOString(),
    fechaReporte:    null,
    tamaño:          null,
    tipoEjecucion:   null,
    totalServidores: 0,
    totalCampanas:   0,
    totalRegistros:  0,
    registrosValidos: 0,
    dupInactivados:  0,
    duracionMs:      null,
    duracion:        null,
    fase:            'inicio',
    error:           null,
  };

  const pool = createPool({
    server:   process.env.MCOB_DB_SERVER,
    database: process.env.MCOB_DB_DATABASE,
    user:     process.env.MCOB_DB_USER,
    pass:     process.env.MCOB_DB_PASS,
  });

  try {
    await pool.connect();

    const { tipo, fecha } = getTipoYFecha(process.env.WOLKVOX_FECHA || '');
    estado.tipoEjecucion = tipo;
    estado.fechaReporte  = fechaReporteDisplay(fecha);
    console.log(`[wolkvox] tipo=${tipo || 'override'}, fecha=${fecha}`);

    estado.fase = 'limpiar';
    await limpiarTmpGestiones(pool);

    estado.fase = 'servidores';
    const servidores = await listarServidoresConCampanas(pool);
    console.log(`[wolkvox] servidores encontrados: ${servidores.length}`);

    const registros = [];
    const reconServidores = []; // acumulador para reconciliación

    for (const srv of servidores) {
      // tipo=0 (override manual) → procesar todos; si no, solo los del turno actual
      if (tipo !== 0 && srv.timEje !== tipo) continue;
      estado.totalServidores++;
      console.log(`[wolkvox] servidor: ${srv.host} (${srv.user}) — ${srv.campanas.length} campañas`);

      const resultados = [];
      for (const camp of srv.campanas) {
        estado.totalCampanas++;
        const { data, resultado } = await fetchCampanaConReintento({
          intentar: () => intentarCampana({ host: srv.host, token: srv.token, camp, fecha, timeoutMs: FETCH_TIMEOUT_MS }),
          maxReintentos: MAX_REINTENTOS, backoffMs: BACKOFF_MS, dormir: sleep,
        });
        estado.totalRegistros += data.length;
        let validos = 0;
        for (const item of data) { const reg = parsearLlamada(item); if (reg) { registros.push(reg); validos++; } }
        resultados.push({ camp, raw: data.length, validos, resultado });
        if (resultado !== 'ok') console.error(`  campaña ${camp}: ${resultado} (sin data tras reintentos)`);
        else console.log(`  campaña ${camp}: ${data.length} llamadas`);
      }
      reconServidores.push({ host: srv.host, user: srv.user, timEje: srv.timEje, resultados });
    }

    // ── Capa 1: dedup en memoria antes del bulk insert ───────────────────────
    const seen = new Set();
    const registrosDedup = registros.filter(r => {
      const k = `${r.idConfBi}|${r.idClieBi}|${r.idTelBi}|${r.fecGesVc}|${r.horGesVc}|${r.tipResSi}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    const dupMemoria = registros.length - registrosDedup.length;
    if (dupMemoria > 0) console.log(`[wolkvox] dedup memoria: ${dupMemoria} duplicados eliminados`);

    estado.registrosValidos = registrosDedup.length;
    estado.tamaño = `${registrosDedup.length} registros válidos`;
    console.log(`[wolkvox] registros válidos: ${registrosDedup.length} / ${estado.totalRegistros}`);

    const diaHabil = esDiaHabilLima();
    estado.reconciliacion = construirReconciliacion(reconServidores, { diaHabil });

    if (process.env.WOLKVOX_DRY_INGESTA === 'true') {
      console.log('[wolkvox] WOLKVOX_DRY_INGESTA=true — sin escritura; reconciliación:',
        JSON.stringify(estado.reconciliacion, null, 2));
    } else if (registrosDedup.length > 0) {
      estado.fase = 'bulk_insert';
      await bulkRegistrarTmpGestiones(pool, registrosDedup);

      if (process.env.INGESTA_SOLO_CARGA === 'true') {
        console.log('[wolkvox] INGESTA_SOLO_CARGA=true — SP_EJECUTAR omitido, TMP_GESTION llena para revisión');
      } else {
        estado.fase = 'ejecutar';
        await registrarGestiones(pool);

        // ── Capa 2: dedup SQL post-SP — solo en ejecución mañana (tipo=1)
        // tipo=1 reprocesa la fecha de ayer que ya corrió en tipo=2 el día anterior
        if (tipo === 1) {
          estado.fase = 'dedup_sql';
          const inactivados = await dedupGestionesVarios(pool, estado.fechaReporte);
          if (inactivados > 0) {
            console.log(`[wolkvox] dedup SQL: ${inactivados} duplicados inactivados en TBL_GESTION_VARIOS`);
          } else {
            console.log('[wolkvox] dedup SQL: sin duplicados en TBL_GESTION_VARIOS');
          }
          estado.dupInactivados = inactivados;
        }
      }
    }

    estado.fase = 'completado';
    if (estado.status === 'ok') {
      estado.status = calcularStatus(estado.reconciliacion.totalPendientes, diaHabil);
    }
    console.log(`[wolkvox] Procesamiento terminado — status=${estado.status}, pendientes=${estado.reconciliacion.totalPendientes}`);

  } catch (err) {
    estado.status = 'error';
    estado.error  = err.message;
    console.error(`[wolkvox] ERROR (fase=${estado.fase}): ${err.message}`);
  } finally {
    try { await pool.close(); } catch {}
    estado.duracionMs = Date.now() - t0;
    estado.duracion   = formatDuracion(estado.duracionMs);

    fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });
    fs.writeFileSync(
      path.join(DOWNLOADS_DIR, 'last_run_wolkvox.json'),
      JSON.stringify(estado, null, 2)
    );

    const histFile = path.join(DOWNLOADS_DIR, 'history_wolkvox.json');
    let hist = [];
    try { if (fs.existsSync(histFile)) hist = JSON.parse(fs.readFileSync(histFile, 'utf8')); } catch {}
    hist.unshift(estado);
    if (hist.length > 90) hist = hist.slice(0, 90);
    fs.writeFileSync(histFile, JSON.stringify(hist, null, 2));

    try { await notificarEjecucion(estado, 'Wolkvox — Ingesta Llamadas'); } catch (e) {
      console.error(`[wolkvox] notificar error: ${e.message}`);
    }

    process.stdout.write(`\n${JSON.stringify(estado)}\n`);
  }

  process.exit(estado.status === 'ok' ? 0 : 1);
}

if (require.main === module) {
  main().catch(err => { console.error('Fatal:', err); process.exit(1); });
}

module.exports = { main };
