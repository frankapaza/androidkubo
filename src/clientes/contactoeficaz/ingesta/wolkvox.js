require('dotenv').config();
const fs   = require('fs');
const path = require('path');
const { decryptTripleDES }           = require('../../../shared/ingesta/crypto');
const { createPool, limpiarTmpGestiones,
        bulkRegistrarTmpGestiones,
        listarServidoresAsterisk,
        registrarGestiones,
        dedupGestionesVarios }       = require('../../../shared/ingesta/mcob');
const { notificarEjecucion }         = require('../../../shared/ingesta/notificar');

const DOWNLOADS_DIR = path.resolve(process.env.DOWNLOAD_DIR || './descargas');
const KEY_CRYPT     = process.env.KEY_CRYPT;

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
  if (!res.ok) return [];
  const json = await res.json();
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

async function main() {
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
    const servidores = await listarServidoresAsterisk(pool);
    console.log(`[wolkvox] servidores encontrados: ${servidores.length}`);

    const registros = [];

    // Filtro opcional por host: WOLKVOX_HOSTS=wv0059,wv0067
    const hostsFilter = (process.env.WOLKVOX_HOSTS || '')
      .split(',').map(h => h.trim()).filter(Boolean);

    for (const srv of servidores) {
      // tipo=0 (override manual) → procesar todos sin filtro de turno
      if (tipo !== 0 && srv.TIM_EJE_SI !== tipo) continue;
      // Filtro por host si se especificó WOLKVOX_HOSTS
      if (hostsFilter.length > 0 && !hostsFilter.some(h => srv.AMI_HOST_VC.includes(h))) continue;
      estado.totalServidores++;
      console.log(`[wolkvox] servidor: ${srv.AMI_USER_VC} (campañas ${srv.CAMP_MIN_PROV_EXT}–${srv.CAMP_MAX_PROV_EXT})`);

      for (let camp = srv.CAMP_MIN_PROV_EXT; camp <= srv.CAMP_MAX_PROV_EXT; camp++) {
        estado.totalCampanas++;
        try {
          const llamadas = await listarLlamadas(srv.AMI_HOST_VC, srv.AMI_PASS_VC, String(camp), fecha);
          estado.totalRegistros += llamadas.length;
          if (llamadas.length) console.log(`  campaña ${camp}: ${llamadas.length} llamadas`);

          for (const item of llamadas) {
            const reg = parsearLlamada(item);
            if (reg) registros.push(reg);
          }
        } catch (err) {
          console.error(`  campaña ${camp} error: ${err.message}`);
        }
      }
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

    if (registrosDedup.length > 0) {
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
    console.log('[wolkvox] Procesamiento terminado correctamente');

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
