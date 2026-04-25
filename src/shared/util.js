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

module.exports = { fechaHoyDDMMYYYY, log };
