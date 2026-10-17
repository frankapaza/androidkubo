require('dotenv').config();
const fs   = require('fs');
const path = require('path');
const sql  = require('mssql');
const { createPool }          = require('../../../shared/ingesta/mcob');
const { notificarEjecucion }  = require('../../../shared/ingesta/notificar');

const DOWNLOADS_DIR = path.resolve(process.env.DOWNLOAD_DIR || './descargas');

// ─── Fechas (hora Perú) ───────────────────────────────────────────────────────
// Rango semiabierto [inicio, fin) que se manda al SP. Por defecto se procesa solo
// el día ANTERIOR (completo y ya deduplicado por Wolkvox/IPBusiness).
// REPORTE_GESTIONES_DIAS_ATRAS=N procesa los últimos N días hasta ayer, para
// recapturar gestiones tardías (idempotente: el SP borra el rango y reinserta).

function hoyLimaISO() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' }); // yyyy-MM-dd
}

function addDaysISO(iso, days) {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toLocaleDateString('en-CA');
}

function getRango() {
  // Override manual: REPORTE_GESTIONES_FECHA_INICIO / _FIN (yyyy-MM-dd)
  const ovIni = (process.env.REPORTE_GESTIONES_FECHA_INICIO || '').trim();
  const ovFin = (process.env.REPORTE_GESTIONES_FECHA_FIN || '').trim();
  if (ovIni) return { inicio: ovIni, fin: ovFin || addDaysISO(ovIni, 1) };

  const hoy        = hoyLimaISO();
  const diasAtras  = parseInt(process.env.REPORTE_GESTIONES_DIAS_ATRAS || '1', 10);
  return {
    inicio: addDaysISO(hoy, -Math.max(1, diasAtras || 1)), // hoy - N (N=1 → solo ayer)
    fin:    hoy,                                            // exclusivo: hasta ayer, sin hoy
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
    status:          'ok',
    timestamp:       new Date().toISOString(),
    fechaReporte:    null,
    rango:           null,
    tamaño:          null,
    filasEliminadas: null,
    registrosValidos: null, // filas insertadas (nombre alineado al template de correo)
    duracionMs:      null,
    duracion:        null,
    fase:            'inicio',
    error:           null,
  };

  // Destino = base de reporting (separada). Por defecto reutiliza el server/credenciales de MCOB.
  const pool = createPool({
    server:   process.env.REPORTING_DB_SERVER   || process.env.MCOB_DB_SERVER,
    database: process.env.REPORTING_DB_DATABASE || 'BD_MCOB_REPORTING',
    user:     process.env.REPORTING_DB_USER     || process.env.MCOB_DB_USER,
    pass:     process.env.REPORTING_DB_PASS     || process.env.MCOB_DB_PASS,
  });

  try {
    await pool.connect();

    const { inicio, fin } = getRango();
    estado.fechaReporte = inicio === addDaysISO(fin, -1) ? inicio : `${inicio} → ${fin}`;
    estado.rango        = `[${inicio}, ${fin})`;
    console.log(`[reporte-gestiones] cargando rango ${estado.rango}`);

    estado.fase = 'procesar';
    const req = pool.request();
    req.timeout = 600000; // 10 min — la consulta cross-database puede ser pesada
    req.input('FECHA_INICIO', sql.Date, inicio);
    req.input('FECHA_FIN',    sql.Date, fin);
    const result = await req.execute('ETL.SP_PROCESAR_GESTIONES');

    // Leer el resultado del log de la corrida recién ejecutada
    estado.fase = 'leer_log';
    const logRes = await pool.request().query(`
      SELECT TOP 1 ESTADO, FILAS_ELIMINADAS, FILAS_INSERTADAS, MENSAJE
      FROM ETL.TBL_PROCESO_LOG
      WHERE NOMBRE_PROCESO = 'SP_PROCESAR_GESTIONES'
      ORDER BY ID_LOG DESC
    `);
    const log = logRes.recordset[0] || {};
    estado.filasEliminadas  = log.FILAS_ELIMINADAS != null ? Number(log.FILAS_ELIMINADAS) : null;
    estado.registrosValidos = log.FILAS_INSERTADAS != null ? Number(log.FILAS_INSERTADAS) : null;
    estado.tamaño = `${estado.registrosValidos ?? '?'} filas insertadas`;
    console.log(`[reporte-gestiones] ${log.MENSAJE || '(sin mensaje de log)'}`);

    if (log.ESTADO && log.ESTADO !== 'OK') {
      throw new Error(`El SP terminó en estado ${log.ESTADO}: ${log.MENSAJE || ''}`);
    }

    estado.fase = 'completado';
    console.log('[reporte-gestiones] Carga incremental terminada correctamente');

  } catch (err) {
    estado.status = 'error';
    estado.error  = err.message;
    console.error(`[reporte-gestiones] ERROR (fase=${estado.fase}): ${err.message}`);
  } finally {
    try { await pool.close(); } catch {}
    estado.duracionMs = Date.now() - t0;
    estado.duracion   = formatDuracion(estado.duracionMs);

    fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });
    fs.writeFileSync(
      path.join(DOWNLOADS_DIR, 'last_run_reporte_gestiones.json'),
      JSON.stringify(estado, null, 2)
    );

    const histFile = path.join(DOWNLOADS_DIR, 'history_reporte_gestiones.json');
    let hist = [];
    try { if (fs.existsSync(histFile)) hist = JSON.parse(fs.readFileSync(histFile, 'utf8')); } catch {}
    hist.unshift(estado);
    if (hist.length > 90) hist = hist.slice(0, 90);
    fs.writeFileSync(histFile, JSON.stringify(hist, null, 2));

    try { await notificarEjecucion(estado, 'Reporte Gestiones — ETL'); } catch (e) {
      console.error(`[reporte-gestiones] notificar error: ${e.message}`);
    }

    process.stdout.write(`\n${JSON.stringify(estado)}\n`);
  }

  process.exit(estado.status === 'ok' ? 0 : 1);
}

if (require.main === module) {
  main().catch(err => { console.error('Fatal:', err); process.exit(1); });
}

module.exports = { main };
