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

module.exports = { hostDe, resumirServidores, parchearServidor };
