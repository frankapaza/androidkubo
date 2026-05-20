const fs = require('fs');
const path = require('path');

const MFA_FILE = path.resolve(process.env.DOWNLOAD_DIR || './descargas', 'mfa-mibanco.json');

function readState() {
  try {
    if (fs.existsSync(MFA_FILE)) return JSON.parse(fs.readFileSync(MFA_FILE, 'utf8'));
  } catch {}
  return null;
}

function writeState(state) {
  fs.writeFileSync(MFA_FILE, JSON.stringify(state), 'utf8');
}

function clearState() {
  try { fs.unlinkSync(MFA_FILE); } catch {}
}

function resolveWithCode(code) {
  writeState({ status: 'resolved', code, at: new Date().toISOString() });
}

async function waitForCode(timeoutMs = 5 * 60 * 1000) {
  writeState({ status: 'waiting', since: new Date().toISOString() });
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 2000));
    const state = readState();
    if (state?.status === 'resolved' && state.code) {
      clearState();
      return state.code;
    }
  }
  clearState();
  throw new Error('Timeout esperando código MFA (5 min sin respuesta del usuario)');
}

module.exports = { readState, resolveWithCode, waitForCode, clearState };
