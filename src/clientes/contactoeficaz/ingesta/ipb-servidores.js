// Funciones puras del detalle por servidor de IPBusiness (testeables sin red ni BD).

// Host de la URL; el path lleva un token, así que nunca se persiste la URL completa.
function hostDe(url) {
  try { return new URL(url).host; } catch { return url; }
}

// Totales + status de la corrida a partir del detalle por servidor.
// 'vacio' (respuesta [] válida) no es error; 'error' (HTTP/timeout/JSON) sí.
function resumirServidores(servidores) {
  const totalRegistros   = servidores.reduce((a, s) => a + (s.raw || 0), 0);
  const registrosValidos = servidores.reduce((a, s) => a + (s.validos || 0), 0);
  const fallidos = servidores.filter(s => s.resultado === 'error');
  return {
    totalRegistros,
    registrosValidos,
    status: fallidos.length ? 'error' : 'ok',
    error: fallidos.length
      ? `Fallaron ${fallidos.length} de ${servidores.length} servidores: ` +
        fallidos.map(s => `${s.host} (${s.error || 'error'})`).join(', ')
      : null,
  };
}

// Reintento de un servidor: reemplaza su detalle en la corrida de esa fecha
// (la más reciente) y recalcula totales/status. No muta la entrada recibida.
function parchearServidor(history, { fechaReporte, servidor }) {
  const idx = history.findIndex(e => e.fechaReporte === fechaReporte && Array.isArray(e.servidores));
  if (idx === -1) return { history, patched: false };
  const e = history[idx];
  const servidores = e.servidores.map(s =>
    s.host === servidor.host ? { ...servidor, reintentado: true } : s);
  const r = resumirServidores(servidores);
  const nueva = {
    ...e,
    servidores,
    totalRegistros:   r.totalRegistros,
    registrosValidos: r.registrosValidos,
    tamaño:           `${r.registrosValidos} registros válidos`,
    status:           r.status,
    error:            r.error,
  };
  const out = history.slice();
  out[idx] = nueva;
  return { history: out, patched: true };
}

const MAX_DIAS_REGULARIZAR = 31;

// Fechas yyyy-MM-dd de desde..hasta (inclusive) para regularizar.
// Devuelve { fechas } o { error } si el rango es inválido o incluye fechas futuras.
function rangoFechas(desde, hasta, hoy) {
  const re = /^\d{4}-\d{2}-\d{2}$/;
  if (!re.test(String(desde || '')) || !re.test(String(hasta || ''))) return { error: 'fechas deben ser yyyy-MM-dd' };
  const d0 = new Date(`${desde}T00:00:00Z`), d1 = new Date(`${hasta}T00:00:00Z`);
  if (isNaN(d0) || isNaN(d1)) return { error: 'fecha inválida' };
  if (d0 > d1) return { error: 'desde debe ser anterior o igual a hasta' };
  if (hasta > hoy) return { error: 'no se pueden regularizar fechas futuras' };
  const fechas = [];
  for (let d = d0; d <= d1; d = new Date(d.getTime() + 86_400_000)) {
    fechas.push(d.toISOString().slice(0, 10));
    if (fechas.length > MAX_DIAS_REGULARIZAR) return { error: `máximo ${MAX_DIAS_REGULARIZAR} días por regularización` };
  }
  return { fechas };
}

module.exports = { hostDe, resumirServidores, parchearServidor, rangoFechas, MAX_DIAS_REGULARIZAR };
