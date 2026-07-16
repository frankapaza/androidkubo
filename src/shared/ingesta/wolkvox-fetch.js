const sleep = ms => new Promise(r => setTimeout(r, ms));

async function intentarCampana({ host, token, camp, fecha, fetchImpl = fetch, timeoutMs = 20000 }) {
  const url = `https://${host}.wolkvox.com/api/v2/reports_manager.php` +
    `?api=campaign_3&campaign_id=${camp}&date_ini=${fecha}000000&date_end=${fecha}235959`;
  try {
    const res = await fetchImpl(url, {
      headers: { Accept: 'application/json', 'wolkvox-token': token },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return { resultado: 'error', data: [], detalle: { tipo: 'http', status: res.status } };
    const json = await res.json();
    if (json.error) return { resultado: 'error', data: [], detalle: { tipo: 'api', msg: String(json.error).slice(0, 140) } };
    const data = Array.isArray(json.data) ? json.data : [];
    return data.length
      ? { resultado: 'ok', data, detalle: null }
      : { resultado: 'vacio', data: [], detalle: { tipo: 'vacio' } };
  } catch (e) {
    const esTimeout = e && (e.name === 'TimeoutError' || e.name === 'AbortError');
    return { resultado: 'error', data: [], detalle: esTimeout ? { tipo: 'timeout' } : { tipo: 'conexion', msg: (e && e.message || '').slice(0, 140) } };
  }
}

// Reintenta mientras el resultado sea 'error' o 'vacio', hasta maxReintentos veces.
async function fetchCampanaConReintento({ intentar, maxReintentos = 2, backoffMs = 1500, dormir = sleep }) {
  let ultimo = { resultado: 'error', data: [] };
  for (let intento = 0; intento <= maxReintentos; intento++) {
    if (intento > 0) await dormir(intento * backoffMs);
    ultimo = await intentar();
    if (ultimo.resultado === 'ok') return { ...ultimo, intentos: intento + 1 };
  }
  return { ...ultimo, intentos: maxReintentos + 1 };
}

module.exports = { sleep, intentarCampana, fetchCampanaConReintento };
