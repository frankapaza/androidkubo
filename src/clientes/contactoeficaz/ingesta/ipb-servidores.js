// Funciones puras del detalle por servidor de IPBusiness (testeables sin red ni BD).

// Host de la URL; el path lleva un token, así que nunca se persiste la URL completa.
function hostDe(url) {
  try { return new URL(url).host; } catch { return url; }
}

// Cuerpo de la API → arreglo de llamadas. Sin llamadas en la fecha (ej. fin de semana)
// la API responde HTTP 200 con texto plano "No se encontraron datos del yyyy-MM-dd".
function parsearRespuesta(texto) {
  const t = String(texto || '').trim();
  if (/^No se encontraron datos/i.test(t)) return [];
  let data;
  try { data = JSON.parse(t); } catch { throw new Error(`respuesta no JSON: "${t.slice(0, 60)}"`); }
  if (!Array.isArray(data)) throw new Error('respuesta no es un arreglo JSON');
  return data;
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
  return parchearServidores(history, { fechaReporte, servidores: [servidor] });
}

// Igual que parchearServidor pero con varios servidores (regularización parcial).
// Los hosts que la corrida no tenía se agregan al final.
function parchearServidores(history, { fechaReporte, servidores: nuevos }) {
  const idx = history.findIndex(e => e.fechaReporte === fechaReporte && Array.isArray(e.servidores));
  if (idx === -1) return { history, patched: false };
  const e = history[idx];
  const porHost = new Map(nuevos.map(s => [s.host, { ...s, reintentado: true }]));
  const servidores = e.servidores.map(s => porHost.get(s.host) || s);
  for (const [h, s] of porHost) if (!e.servidores.some(x => x.host === h)) servidores.push(s);
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

// Filas del panel: todos los servidores configurados en IPB_URL (en ese orden), con el
// detalle de la corrida si lo tiene; los que no (corrida antigua o servidor agregado
// después) quedan como 'sin_detalle'. Hosts de la corrida que ya no están en IPB_URL van al final.
function servidoresParaPanel(servidores, ipbUrl) {
  const detalle = new Map((Array.isArray(servidores) ? servidores : []).map(s => [s.host, s]));
  const hosts = String(ipbUrl || '').split(',').map(u => u.trim()).filter(Boolean).map(hostDe);
  const filas = [...new Set(hosts)].map(h => detalle.get(h) || { host: h, resultado: 'sin_detalle' });
  for (const [h, s] of detalle) if (!hosts.includes(h)) filas.push(s);
  return filas;
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

// Hosts elegidos para regularizar. Vacío/ausente o todos = null (corrida completa).
// Devuelve { hosts } o { error } si alguno no está entre los disponibles.
function validarHosts(hosts, disponibles) {
  if (hosts == null || (Array.isArray(hosts) && !hosts.length)) return { hosts: null };
  if (!Array.isArray(hosts) || hosts.some(h => typeof h !== 'string')) return { error: 'hosts debe ser una lista' };
  const desconocidos = hosts.filter(h => !disponibles.includes(h));
  if (desconocidos.length) return { error: `servidores no configurados en IPB_URL: ${desconocidos.join(', ')}` };
  const unicos = [...new Set(hosts)];
  return { hosts: unicos.length === new Set(disponibles).size ? null : unicos };
}

module.exports = { hostDe, parsearRespuesta, resumirServidores, parchearServidor, parchearServidores, validarHosts, rangoFechas, servidoresParaPanel, MAX_DIAS_REGULARIZAR };
