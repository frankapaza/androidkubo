const fs   = require('fs');
const path = require('path');

const STATUS_FILE = path.resolve(__dirname, '../../descargas/bot_status.json');

function read() {
  try {
    if (fs.existsSync(STATUS_FILE)) return JSON.parse(fs.readFileSync(STATUS_FILE, 'utf8'));
  } catch {}
  return {};
}

function write(state) {
  fs.mkdirSync(path.dirname(STATUS_FILE), { recursive: true });
  fs.writeFileSync(STATUS_FILE, JSON.stringify(state, null, 2));
}

function isEnabled(autoId) {
  return read()[autoId] !== false; // por defecto activo
}

function setEnabled(autoId, enabled) {
  const s = read();
  s[autoId] = !!enabled;
  write(s);
}

module.exports = { isEnabled, setEnabled };
