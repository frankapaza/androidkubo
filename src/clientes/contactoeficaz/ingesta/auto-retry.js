// Lógica pura para el reintento automático de campañas en 'error' tras una corrida.

// De estado.reconciliacion, devuelve los servidores con campañas en 'error'
// (solo 'error', no 'vacío') y la lista de sus campañas.
function extraerErrorPendientes(estado) {
  const servs = estado && estado.reconciliacion && estado.reconciliacion.servidores;
  if (!Array.isArray(servs)) return [];
  const out = [];
  for (const s of servs) {
    const camps = (s.pendientes || [])
      .filter(p => p.resultado === 'error')
      .map(p => p.camp);
    if (camps.length) out.push({ host: s.host, user: s.user, camps });
  }
  return out;
}

// 'DD/MM/YYYY' -> 'yyyyMMdd'
function fechaReporteToYyyymmdd(fechaReporte) {
  const m = String(fechaReporte || '').match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? `${m[3]}${m[2]}${m[1]}` : '';
}

module.exports = { extraerErrorPendientes, fechaReporteToYyyymmdd };
