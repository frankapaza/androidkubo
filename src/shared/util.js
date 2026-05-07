function fechaHoyDDMMYYYY(tz = 'America/Lima') {
  const parts = new Intl.DateTimeFormat('es-PE', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const get = (t) => parts.find((p) => p.type === t).value;
  return `${get('day')}/${get('month')}/${get('year')}`;
}

function log(msg) {
  const ts = new Date().toISOString();
  console.log(`[${ts}] ${msg}`);
}

function limpiarScreenshotsAntiguos(dir, dias = 7) {
  const fs = require('fs');
  const path = require('path');
  if (!fs.existsSync(dir)) return { borrados: 0 };
  const limite = Date.now() - dias * 24 * 60 * 60 * 1000;
  let borrados = 0;
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.png')) continue;
    const isError = f.startsWith('error_');
    const isMibanco = f.startsWith('mibanco_');
    const isSurgir = f.startsWith('surgir_');
    if (!isError && !isMibanco && !isSurgir) continue;
    const ruta = path.join(dir, f);
    try {
      const m = fs.statSync(ruta).mtimeMs;
      if (m < limite) {
        fs.unlinkSync(ruta);
        borrados += 1;
      }
    } catch (_) {}
  }
  return { borrados };
}

module.exports = { fechaHoyDDMMYYYY, log, limpiarScreenshotsAntiguos };
