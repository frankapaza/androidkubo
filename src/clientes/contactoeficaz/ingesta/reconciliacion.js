function esDiaHabilLima(date = new Date()) {
  const wd = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Lima', weekday: 'short' }).format(date);
  return wd !== 'Sat' && wd !== 'Sun';
}

function construirReconciliacion(servidores, { diaHabil }) {
  const out = servidores.map(s => {
    const pendientes = s.resultados
      .filter(r => r.resultado !== 'ok')
      .map(r => ({ camp: r.camp, resultado: r.resultado }));
    const campanas = s.resultados.map(r => ({
      camp: r.camp, validos: r.validos || 0, raw: r.raw || 0, resultado: r.resultado, intentos: r.intentos,
    }));
    return {
      host: s.host, user: s.user, turno: s.timEje,
      campanasTotal: s.resultados.length,
      conData: s.resultados.filter(r => r.resultado === 'ok').length,
      registrosRaw: s.resultados.reduce((a, r) => a + (r.raw || 0), 0),
      registrosValidos: s.resultados.reduce((a, r) => a + (r.validos || 0), 0),
      pendientes,
      campanas,
    };
  });
  const totalPendientes = out.reduce((a, s) => a + s.pendientes.length, 0);
  return { servidores: out, totalPendientes, diaHabil };
}

function calcularStatus(totalPendientes, diaHabil) {
  return totalPendientes > 0 && diaHabil ? 'warning' : 'ok';
}

function yyyymmddToDisplay(f) {
  return `${f.slice(6, 8)}/${f.slice(4, 6)}/${f.slice(0, 4)}`;
}

// Parchea (inmutablemente) la reconciliación persistida: quita las campañas recuperadas
// de pendientes del servidor coincidente en la entrada de esa fecha, y ajusta contadores.
function parchearReconciliacion(history, { fecha, host, user, recuperadas }) {
  const display = yyyymmddToDisplay(fecha);
  const camps = new Set(recuperadas.map(r => r.camp));
  const recMap = new Map(recuperadas.map(r => [r.camp, r]));
  const sumV = recuperadas.reduce((a, r) => a + (r.validos || 0), 0);
  const sumR = recuperadas.reduce((a, r) => a + (r.raw || 0), 0);
  let patched = false;

  const nuevo = history.map(entry => {
    if (patched || entry.fechaReporte !== display || !entry.reconciliacion) return entry;
    let cambiado = false;
    const servidores = entry.reconciliacion.servidores.map(s => {
      if (s.host !== host || s.user !== user) return s;
      const pendientes = s.pendientes.filter(p => !camps.has(p.camp));
      const recuperadasReal = s.pendientes.length - pendientes.length;
      if (recuperadasReal === 0) return s;
      cambiado = true;
      return {
        ...s,
        pendientes,
        conData: s.conData + recuperadasReal,
        registrosValidos: s.registrosValidos + sumV,
        registrosRaw: s.registrosRaw + sumR,
        campanas: Array.isArray(s.campanas) ? s.campanas.map(c => {
          if (!recMap.has(c.camp)) return c;
          const r = recMap.get(c.camp);
          return { ...c, resultado: 'ok', validos: r.validos || 0, raw: r.raw || 0 };
        }) : s.campanas,
      };
    });
    if (!cambiado) return entry;
    patched = true;
    const totalPendientes = servidores.reduce((a, s) => a + s.pendientes.length, 0);
    return { ...entry, reconciliacion: { ...entry.reconciliacion, servidores, totalPendientes } };
  });

  return { history: nuevo, patched };
}

module.exports = { esDiaHabilLima, construirReconciliacion, calcularStatus, yyyymmddToDisplay, parchearReconciliacion };
