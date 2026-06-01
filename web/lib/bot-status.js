const fs   = require('fs');
const path = require('path');

const STATUS_FILE = path.resolve(__dirname, '../../descargas/bot_status.json');

function read() {
  try {
    if (fs.existsSync(STATUS_FILE)) return JSON.parse(fs.readFileSync(STATUS_FILE, 'utf8'));
  } catch (e) {
    console.error('[bot-status] Error leyendo', STATUS_FILE, e.message);
  }
  return {};
}

function write(state) {
  try {
    fs.mkdirSync(path.dirname(STATUS_FILE), { recursive: true });
    fs.writeFileSync(STATUS_FILE, JSON.stringify(state, null, 2));
    console.log('[bot-status] Estado guardado:', JSON.stringify(state));
  } catch (e) {
    console.error('[bot-status] ERROR al escribir', STATUS_FILE, e.message);
    throw e;
  }
}

function isEnabled(autoId) {
  const val = read()[autoId];
  console.log(`[bot-status] isEnabled(${autoId}) →`, val, '→ resultado:', val !== false);
  return val !== false;
}

function setEnabled(autoId, enabled) {
  const s = read();
  s[autoId] = !!enabled;
  console.log(`[bot-status] setEnabled(${autoId}, ${enabled}) → escribiendo:`, JSON.stringify(s));
  write(s);
}

module.exports = { isEnabled, setEnabled };
