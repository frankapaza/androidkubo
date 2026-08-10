const cron = require('node-cron');
const fs = require('fs');
const { spawn } = require('child_process');
const path = require('path');
const clients = require('./clients');
const envLib = require('./env');
const botStatus = require('./bot-status');
const { extraerErrorPendientes, fechaReporteToYyyymmdd } = require('../../src/clientes/contactoeficaz/ingesta/auto-retry');

const ROOT = path.resolve(__dirname, '../..');
const TIMEZONE = 'America/Lima';
const SKIP_FILE = path.join(ROOT, 'descargas/skip_schedule.json');
const RETRY_INTERVAL_MS = parseInt(process.env.WOLKVOX_RETRY_INTERVAL_MS || '600000', 10); // 10 min
const RETRY_MAX = parseInt(process.env.WOLKVOX_RETRY_MAX || '3', 10);
// Segundo nivel: si tras los reintentos rápidos aún quedan errores, reintentar a estas horas (Lima).
// 2am/3am dan margen; 7am es el decisivo — de noche los tokens del proveedor suelen estar saturados
// y se liberan en la mañana, así que el reintento de 7am es el que normalmente recupera wv0064.
const RETRY_HORAS = (process.env.WOLKVOX_RETRY_HORAS || '2,3,7')
  .split(',').map(s => parseInt(s.trim(), 10)).filter(h => h >= 0 && h <= 23);

let activeTasks = [];

function todayPeruISO() {
  const peruDateStr = new Date().toLocaleDateString('en-CA', { timeZone: TIMEZONE });
  return peruDateStr;
}

function readSkipState() {
  try { if (fs.existsSync(SKIP_FILE)) return JSON.parse(fs.readFileSync(SKIP_FILE, 'utf8')); } catch {}
  return {};
}

function writeSkipState(state) {
  try {
    fs.mkdirSync(path.dirname(SKIP_FILE), { recursive: true });
    fs.writeFileSync(SKIP_FILE, JSON.stringify(state, null, 2));
  } catch {}
}

function markSkipToday(autoId) {
  const state = readSkipState();
  state[autoId] = todayPeruISO();
  writeSkipState(state);
}

function shouldSkipToday(autoId) {
  return readSkipState()[autoId] === todayPeruISO();
}

function clearSkip(autoId) {
  const state = readSkipState();
  delete state[autoId];
  writeSkipState(state);
}

function parseCron(timeStr) {
  if (!timeStr || !timeStr.trim()) return null;
  const m = timeStr.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return `${min} ${h} * * *`;
}

function parseUltimoJson(texto) {
  const lines = String(texto || '').trim().split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (line.startsWith('{') && line.endsWith('}')) { try { return JSON.parse(line); } catch {} }
  }
  return null;
}

// Lanza el modo dirigido de wolkvox y resuelve con el resumen ({recuperadas, aunPendientes}).
function spawnDirigido(host, user, camps, fecha) {
  return new Promise(resolve => {
    const scriptPath = clients.contactoeficaz.automations.wolkvox.script;
    const proc = spawn('node', [scriptPath], {
      env: {
        ...process.env, ...envLib.read(),
        WOLKVOX_ONLY_HOST: host, WOLKVOX_ONLY_USER: user,
        WOLKVOX_ONLY_CAMPS: camps.join(','), WOLKVOX_FECHA: fecha,
      },
      cwd: ROOT,
    });
    let out = '';
    proc.stdout.on('data', d => { out += d.toString(); process.stdout.write(d); });
    proc.stderr.on('data', d => process.stderr.write(d));
    proc.on('close', () => resolve(parseUltimoJson(out)));
    proc.on('error', () => resolve(null));
  });
}

// ms desde una hora actual (H:M:S) hasta la próxima ocurrencia de horaObjetivo:00. Función pura (testeable).
function msHastaHora(hActual, mActual, sActual, horaObjetivo) {
  let diffSeg = horaObjetivo * 3600 - (hActual * 3600 + mActual * 60 + sActual);
  if (diffSeg <= 0) diffSeg += 24 * 3600; // ya pasó hoy → mañana
  return diffSeg * 1000;
}

function msHastaHoraLima(horaObjetivo) {
  const p = new Intl.DateTimeFormat('en-US', {
    timeZone: TIMEZONE, hourCycle: 'h23', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).format(new Date());
  const [h, m, s] = p.split(':').map(Number);
  return msHastaHora(h, m, s, horaObjetivo);
}

// Segundo nivel de reintento: a horas fijas (RETRY_HORAS, ej. 2am y 3am Lima).
function programarReintentosHorarios(fechaReporte, servidores, horas, idx) {
  if (idx >= horas.length) {
    console.log(`[scheduler] wolkvox: agotados los reintentos horarios; ${servidores.length} servidor(es) quedan para reintento manual`);
    return;
  }
  const fecha = fechaReporteToYyyymmdd(fechaReporte);
  if (!fecha) return;
  const hora = horas[idx];
  const ms = msHastaHoraLima(hora);
  console.log(`[scheduler] wolkvox: reintento horario ${hora}:00 (en ${Math.round(ms / 60000)} min) para ${servidores.length} servidor(es)`);
  setTimeout(async () => {
    if (!botStatus.isEnabled('wolkvox')) { console.log('[scheduler] wolkvox: reintento horario omitido — bot inactivo'); return; }
    const sigue = [];
    for (const s of servidores) {
      console.log(`[scheduler] wolkvox: reintento ${hora}:00 — ${s.host} (${s.user}) — ${s.camps.length} campañas`);
      const resumen = await spawnDirigido(s.host, s.user, s.camps, fecha);
      const aun = ((resumen && resumen.aunPendientes) || []).filter(p => p.resultado === 'error').map(p => p.camp);
      if (aun.length) sigue.push({ host: s.host, user: s.user, camps: aun });
    }
    if (sigue.length) programarReintentosHorarios(fechaReporte, sigue, horas, idx + 1);
    else console.log(`[scheduler] wolkvox: reintento ${hora}:00 recuperó todo lo pendiente`);
  }, ms);
}

// Reintento automático de campañas en 'error': cada RETRY_INTERVAL_MS, hasta RETRY_MAX veces.
function programarReintentos(fechaReporte, servidores, intento) {
  const fecha = fechaReporteToYyyymmdd(fechaReporte);
  if (!fecha) return;
  console.log(`[scheduler] wolkvox: reintento auto ${intento}/${RETRY_MAX} en ${Math.round(RETRY_INTERVAL_MS / 60000)} min para ${servidores.length} servidor(es)`);
  setTimeout(async () => {
    if (!botStatus.isEnabled('wolkvox')) { console.log('[scheduler] wolkvox: reintento auto omitido — bot inactivo'); return; }
    const sigue = [];
    for (const s of servidores) {
      console.log(`[scheduler] wolkvox: reintentando ${s.host} (${s.user}) — ${s.camps.length} campañas`);
      const resumen = await spawnDirigido(s.host, s.user, s.camps, fecha);
      const aun = ((resumen && resumen.aunPendientes) || []).filter(p => p.resultado === 'error').map(p => p.camp);
      if (aun.length) sigue.push({ host: s.host, user: s.user, camps: aun });
    }
    if (sigue.length && intento < RETRY_MAX) programarReintentos(fechaReporte, sigue, intento + 1);
    else if (sigue.length) {
      console.log(`[scheduler] wolkvox: ${sigue.length} servidor(es) siguen con error tras ${RETRY_MAX} reintentos rápidos`);
      if (RETRY_HORAS.length) programarReintentosHorarios(fechaReporte, sigue, RETRY_HORAS, 0);
      else console.log('[scheduler] wolkvox: sin reintentos horarios configurados — quedan para reintento manual');
    }
    else console.log('[scheduler] wolkvox: reintentos automáticos recuperaron todos los errores');
  }, RETRY_INTERVAL_MS);
}

function runScript(clientId, autoId, scriptPath) {
  console.log(`[scheduler] Iniciando ${clientId}/${autoId}`);
  const proc = spawn('node', [scriptPath], {
    env: { ...process.env, ...envLib.read() },
    cwd: ROOT,
  });
  let stdout = '';
  proc.stdout.on('data', d => { stdout += d.toString(); process.stdout.write(d); });
  proc.stderr.on('data', d => process.stderr.write(d));
  proc.on('close', code => {
    console.log(`[scheduler] ${clientId}/${autoId} finalizado (código ${code})`);
    // Reintento automático solo para corridas programadas de wolkvox con campañas en 'error'.
    if (autoId === 'wolkvox' && RETRY_MAX > 0) {
      const estado = parseUltimoJson(stdout);
      if (estado && estado.reconciliacion && estado.fechaReporte) {
        const pend = extraerErrorPendientes(estado);
        if (pend.length) programarReintentos(estado.fechaReporte, pend, 1);
      }
    }
  });
  proc.on('error', err => {
    console.error(`[scheduler] Error lanzando ${clientId}/${autoId}:`, err.message);
  });
}

function start() {
  stop();
  const env = { ...process.env, ...envLib.read() };

  for (const [clientId, client] of Object.entries(clients)) {
    for (const [autoId, auto] of Object.entries(client.automations)) {
      // Soporta scheduleKeys (array) y scheduleKey (string) indistintamente
      const keys = auto.scheduleKeys
        ? auto.scheduleKeys
        : auto.scheduleKey ? [auto.scheduleKey] : [];

      for (const key of keys) {
        const timeStr = env[key];
        const expr = parseCron(timeStr);
        if (!expr) continue;

        const task = cron.schedule(expr, () => {
          if (!botStatus.isEnabled(autoId)) {
            console.log(`[scheduler] ${clientId}/${autoId} omitido — bot inactivo`);
            return;
          }
          if (shouldSkipToday(autoId)) {
            console.log(`[scheduler] ${clientId}/${autoId} omitido hoy (envío manual ya realizado)`);
            clearSkip(autoId);
            return;
          }
          runScript(clientId, autoId, auto.script);
        }, {
          timezone: TIMEZONE,
          scheduled: true,
        });

        activeTasks.push({ task, clientId, autoId, time: timeStr });
        console.log(`[scheduler] ${clientId}/${autoId} → ${timeStr} hora Perú (cron: ${expr})`);
      }
    }
  }

  if (activeTasks.length === 0) {
    console.log('[scheduler] Sin horarios configurados');
  }
}

function stop() {
  activeTasks.forEach(({ task }) => task.stop());
  activeTasks = [];
}

function status() {
  return activeTasks.map(({ clientId, autoId, time }) => ({ clientId, autoId, time }));
}

module.exports = { start, stop, status, markSkipToday, shouldSkipToday, clearSkip, msHastaHora };
