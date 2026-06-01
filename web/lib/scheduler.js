const cron = require('node-cron');
const fs = require('fs');
const { spawn } = require('child_process');
const path = require('path');
const clients = require('./clients');
const envLib = require('./env');
const botStatus = require('./bot-status');

const ROOT = path.resolve(__dirname, '../..');
const TIMEZONE = 'America/Lima';
const SKIP_FILE = path.join(ROOT, 'descargas/skip_schedule.json');

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

function runScript(clientId, autoId, scriptPath) {
  console.log(`[scheduler] Iniciando ${clientId}/${autoId}`);
  const proc = spawn('node', [scriptPath], {
    env: { ...process.env, ...envLib.read() },
    cwd: ROOT,
  });
  proc.stdout.on('data', d => process.stdout.write(d));
  proc.stderr.on('data', d => process.stderr.write(d));
  proc.on('close', code => {
    console.log(`[scheduler] ${clientId}/${autoId} finalizado (código ${code})`);
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

module.exports = { start, stop, status, markSkipToday, shouldSkipToday, clearSkip };
