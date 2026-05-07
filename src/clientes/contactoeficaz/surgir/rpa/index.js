const fs = require('fs');
const path = require('path');
const { descargarReporte } = require('./descargaCrm');
const { enviarReporte } = require('./enviarCorreo');
const { log, fechaHoyDDMMYYYY, limpiarScreenshotsAntiguos } = require('../../../../shared/util');
const config = require('../../../../shared/config');

function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function formatDuracion(ms) {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  return `${m} min ${s % 60} s`;
}

function ultimoScreenshotError() {
  try {
    if (!fs.existsSync(config.downloadDir)) return null;
    const files = fs
      .readdirSync(config.downloadDir)
      .filter((f) => f.startsWith('surgir_error_descarga_') && f.endsWith('.png'))
      .map((f) => ({
        ruta: path.join(config.downloadDir, f),
        mtime: fs.statSync(path.join(config.downloadDir, f)).mtimeMs,
      }))
      .sort((a, b) => b.mtime - a.mtime);
    return files.length > 0 ? files[0].ruta : null;
  } catch (_) {
    return null;
  }
}

async function main() {
  const t0 = Date.now();
  const estado = {
    status: 'ok',
    cliente: 'surgir',
    fechaReporte: fechaHoyDDMMYYYY(),
    timestamp: new Date().toISOString(),
    archivo: null,
    archivoNombre: null,
    bytes: null,
    tamaño: null,
    correoEnviado: null,
    duracionMs: null,
    duracion: null,
    fase: 'inicio',
    error: null,
    screenshot: null,
  };

  try {
    estado.fase = 'descarga';
    log('=== Inicio flujo Reporte Surgir ===');

    const { borrados } = limpiarScreenshotsAntiguos(config.downloadDir, 7);
    if (borrados > 0) log(`Limpieza: ${borrados} screenshot(s) >7 días borrado(s)`);

    const { archivo, screenshot } = await descargarReporte();
    estado.archivo = archivo;
    estado.archivoNombre = path.basename(archivo);
    estado.bytes = fs.statSync(archivo).size;
    estado.tamaño = formatBytes(estado.bytes);
    estado.screenshot = screenshot || null;
    log(`=== Descarga OK: ${archivo} (${estado.tamaño}) ===`);

    estado.fase = 'envio';
    const resultado = await enviarReporte(archivo);
    estado.correoEnviado = resultado.to;
    log(`=== Correo OK: ${JSON.stringify(resultado)} ===`);

    estado.fase = 'completado';
  } catch (err) {
    estado.status = 'error';
    estado.error = err.message;
    estado.screenshot = ultimoScreenshotError();
    log(`ERROR (fase=${estado.fase}): ${err.message}`);
  } finally {
    estado.duracionMs = Date.now() - t0;
    estado.duracion = formatDuracion(estado.duracionMs);

    try {
      fs.writeFileSync(
        path.join(config.downloadDir, 'last_run_surgir.json'),
        JSON.stringify(estado, null, 2)
      );
    } catch (_) {}

    try {
      const histFile = path.join(config.downloadDir, 'history_surgir.json');
      let hist = [];
      if (fs.existsSync(histFile)) hist = JSON.parse(fs.readFileSync(histFile, 'utf8'));
      hist.unshift(estado);
      if (hist.length > 90) hist = hist.slice(0, 90);
      fs.writeFileSync(histFile, JSON.stringify(hist, null, 2));
    } catch (_) {}

    process.stdout.write(`\n${JSON.stringify(estado)}\n`);
  }

  process.exit(estado.status === 'ok' ? 0 : 1);
}

if (require.main === module) {
  main().catch((err) => {
    console.error('Fatal no capturado:', err);
    process.exit(1);
  });
}

module.exports = { main };
