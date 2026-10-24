const express = require('express');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { requireAuth } = require('../middleware/auth');
const clients = require('../lib/clients');
const envLib = require('../lib/env');
const scheduler = require('../lib/scheduler');
const botStatus = require('../lib/bot-status');
const versionLib = require('../lib/version');
const { renderDashboard } = require('../views/dashboard');
const mfaLib = require('../../src/shared/mfa');
const { rangoFechas, validarHosts, hostDe } = require('../../src/clientes/contactoeficaz/ingesta/ipb-servidores');

const ROOT = path.resolve(__dirname, '../..');
const router = express.Router();

function getClient(req, res) {
  const client = clients[req.user.clientId];
  if (!client) { res.redirect('/login'); return null; }
  return client;
}

function getAutomation(req, res) {
  const isAdmin = req.user.role === 'admin';
  if (!isAdmin && req.user.clientId !== req.params.clientId) {
    res.status(403).json({ error: 'Sin acceso' }); return null;
  }
  const client = clients[req.params.clientId];
  if (!client) { res.status(404).json({ error: 'Cliente no encontrado' }); return null; }
  const automation = client.automations[req.params.automationId];
  if (!automation) { res.status(404).json({ error: 'Automatización no encontrada' }); return null; }
  return automation;
}

function readLastRun(automation) {
  try {
    if (fs.existsSync(automation.lastRunFile)) {
      return JSON.parse(fs.readFileSync(automation.lastRunFile, 'utf8'));
    }
  } catch {}
  return null;
}

// GET /dashboard
router.get('/dashboard', requireAuth, (req, res) => {
  const client = getClient(req, res);
  if (!client) return;

  const lastRuns = {};
  const enabledStates = {};
  for (const [id, automation] of Object.entries(client.automations)) {
    lastRuns[id] = readLastRun(automation);
    enabledStates[id] = botStatus.isEnabled(id);
  }

  res.send(renderDashboard(req.user, client, lastRuns, { version: versionLib.read(), enabledStates }));
});

// GET /api/clients/:clientId/automations/:automationId/status
router.get('/api/clients/:clientId/automations/:automationId/status', requireAuth, (req, res) => {
  const automation = getAutomation(req, res);
  if (!automation) return;
  res.json({ lastRun: readLastRun(automation) });
});

// POST /api/clients/:clientId/automations/:automationId/toggle
router.post('/api/clients/:clientId/automations/:automationId/toggle', requireAuth, (req, res) => {
  const automation = getAutomation(req, res);
  if (!automation) return;
  const { enabled } = req.body;
  if (typeof enabled !== 'boolean') return res.status(400).json({ error: 'enabled debe ser boolean' });
  botStatus.setEnabled(req.params.automationId, enabled);
  res.json({ ok: true, enabled });
});

// YYYYMMDD real y no futura (hora Perú). Devuelve mensaje de error o null.
function validarFechaManual(fecha) {
  if (!/^\d{8}$/.test(String(fecha))) return 'fecha debe ser YYYYMMDD';
  const iso = `${fecha.slice(0,4)}-${fecha.slice(4,6)}-${fecha.slice(6,8)}`;
  const d = new Date(`${iso}T12:00:00Z`);
  if (isNaN(d) || d.toISOString().slice(0, 10) !== iso) return 'fecha inválida';
  const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' });
  if (iso > hoy) return 'la fecha no puede ser futura';
  return null;
}

// GET /api/clients/:clientId/automations/:automationId/proxima-ejecucion
// Próxima corrida programada (hora Perú) y, en wolkvox, la fecha que procesará.
router.get('/api/clients/:clientId/automations/:automationId/proxima-ejecucion', requireAuth, (req, res) => {
  const automation = getAutomation(req, res);
  if (!automation) return;
  const prox = scheduler.proximaEjecucionDe(req.params.automationId);
  if (!prox) return res.json({ proxima: null });
  res.json({
    proxima: { ...prox, slot: scheduler.slotKey(prox.fecha, prox.hora) },
    procesa: req.params.automationId === 'wolkvox' ? scheduler.fechaProcesaWolkvox(prox) : null,
  });
});

// POST /api/clients/:clientId/automations/:automationId/rerun
router.post('/api/clients/:clientId/automations/:automationId/rerun', requireAuth, (req, res) => {
  const automation = getAutomation(req, res);
  if (!automation) return;

  if (!botStatus.isEnabled(req.params.automationId)) {
    return res.status(403).json({ error: 'Bot inactivo. Actívalo primero desde el dashboard.' });
  }

  // Fecha manual (YYYYMMDD) solo para wolkvox: procesa todos los servidores sin importar el turno.
  const fecha = req.body?.fecha;
  if (fecha !== undefined) {
    if (req.params.automationId !== 'wolkvox') return res.status(400).json({ error: 'fecha solo disponible para wolkvox' });
    const errFecha = validarFechaManual(fecha);
    if (errFecha) return res.status(400).json({ error: errFecha });
  }

  if (req.body?.skipSlot) {
    if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(req.body.skipSlot)) return res.status(400).json({ error: 'skipSlot inválido' });
    scheduler.markSkipSlot(req.params.automationId, req.body.skipSlot);
  } else if (req.body?.skipSchedule) {
    scheduler.markSkipToday(req.params.automationId);
  }

  req.socket.setTimeout(10 * 60 * 1000);

  const proc = spawn('node', [automation.script], {
    env: { ...process.env, ...(fecha ? { WOLKVOX_FECHA: fecha } : {}) },
    cwd: ROOT,
  });

  let stdout = '';
  let stderr = '';
  proc.stdout.on('data', d => { stdout += d.toString(); });
  proc.stderr.on('data', d => { stderr += d.toString(); });

  proc.on('close', code => {
    let summary = null;
    const lines = stdout.trim().split('\n');
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i].trim();
      if (line.startsWith('{') && line.endsWith('}')) {
        try { summary = JSON.parse(line); break; } catch {}
      }
    }
    res.json({ exitCode: code, summary, stdout: stdout.slice(-4000), stderr: stderr.slice(-1000) });
  });

  proc.on('error', err => {
    if (!res.headersSent) res.status(500).json({ error: err.message });
  });
});

// POST /api/clients/:clientId/automations/:automationId/rerun-server
// Modo dirigido: re-ejecuta solo las campañas pendientes de un servidor (solo wolkvox).
router.post('/api/clients/:clientId/automations/:automationId/rerun-server', requireAuth, (req, res) => {
  const automation = getAutomation(req, res);
  if (!automation) return;
  if (req.params.automationId !== 'wolkvox') {
    return res.status(400).json({ error: 'Solo disponible para wolkvox' });
  }
  if (!botStatus.isEnabled(req.params.automationId)) {
    return res.status(403).json({ error: 'Bot inactivo. Actívalo primero desde el dashboard.' });
  }
  const errMsg = validarRerunServerBody(req.body);
  if (errMsg) return res.status(400).json({ error: errMsg });

  const { host, user, fecha, campaigns } = req.body;
  req.socket.setTimeout(10 * 60 * 1000);

  const proc = spawn('node', [automation.script], {
    env: {
      ...process.env,
      WOLKVOX_ONLY_HOST: host,
      WOLKVOX_ONLY_USER: user,
      WOLKVOX_ONLY_CAMPS: campaigns.join(','),
      WOLKVOX_FECHA: fecha,
    },
    cwd: ROOT,
  });

  let stdout = '', stderr = '';
  proc.stdout.on('data', d => { stdout += d.toString(); });
  proc.stderr.on('data', d => { stderr += d.toString(); });
  proc.on('close', code => {
    let summary = null;
    const lines = stdout.trim().split('\n');
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i].trim();
      if (line.startsWith('{') && line.endsWith('}')) { try { summary = JSON.parse(line); break; } catch {} }
    }
    res.json({ exitCode: code, summary, stderr: stderr.slice(-1000) });
  });
  proc.on('error', err => { if (!res.headersSent) res.status(500).json({ error: err.message }); });
});

// POST /api/clients/:clientId/automations/:automationId/rerun-ipb-server
// Modo dirigido IPBusiness: re-descarga y registra un solo servidor para una fecha.
router.post('/api/clients/:clientId/automations/:automationId/rerun-ipb-server', requireAuth, (req, res) => {
  const automation = getAutomation(req, res);
  if (!automation) return;
  if (req.params.automationId !== 'ipbusiness') {
    return res.status(400).json({ error: 'Solo disponible para ipbusiness' });
  }
  if (!botStatus.isEnabled(req.params.automationId)) {
    return res.status(403).json({ error: 'Bot inactivo. Actívalo primero desde el dashboard.' });
  }
  const errMsg = validarRerunIpbBody(req.body);
  if (errMsg) return res.status(400).json({ error: errMsg });

  const { host, fecha } = req.body;
  req.socket.setTimeout(20 * 60 * 1000);

  const proc = spawn('node', [automation.script], {
    env: { ...process.env, IPB_ONLY_HOST: host, IPB_FECHA: fecha },
    cwd: ROOT,
  });

  let stdout = '', stderr = '';
  proc.stdout.on('data', d => { stdout += d.toString(); });
  proc.stderr.on('data', d => { stderr += d.toString(); });
  proc.on('close', code => {
    let summary = null;
    const lines = stdout.trim().split('\n');
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i].trim();
      if (line.startsWith('{') && line.endsWith('}')) { try { summary = JSON.parse(line); break; } catch {} }
    }
    res.json({ exitCode: code, summary, stderr: stderr.slice(-1000) });
  });
  proc.on('error', err => { if (!res.headersSent) res.status(500).json({ error: err.message }); });
});

// ─── Regularización IPBusiness (rango de fechas pasadas) ─────────────────────
// Corre en segundo plano, una fecha tras otra (cada una ~1 min con 8 servidores):
// esperar en la petición superaría los timeouts del proxy. El panel consulta el avance.
let regIpb = { enCurso: false, fechas: [], hosts: null, actual: null, resultados: [], inicio: null, fin: null };

function hoyLima() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' });
}

// hosts: null = todos los servidores; si no, solo esos (IPB_HOSTS).
function correrFechaIpb(script, fecha, hosts) {
  return new Promise(resolve => {
    const proc = spawn('node', [script], {
      env: { ...process.env, IPB_FECHA: fecha, IPB_REGULARIZAR: 'true', IPB_HOSTS: hosts ? hosts.join(',') : '' },
      cwd: ROOT,
    });
    let stdout = '';
    proc.stdout.on('data', d => { stdout += d.toString(); });
    proc.stderr.on('data', d => process.stderr.write(d));
    proc.on('close', () => {
      const lines = stdout.trim().split('\n');
      for (let i = lines.length - 1; i >= 0; i--) {
        const line = lines[i].trim();
        if (line.startsWith('{') && line.endsWith('}')) { try { return resolve(JSON.parse(line)); } catch {} }
      }
      resolve({ status: 'error', error: 'sin resumen del proceso' });
    });
    proc.on('error', err => resolve({ status: 'error', error: err.message }));
  });
}

// POST /api/clients/:clientId/automations/:automationId/regularizar-ipb  { desde, hasta, hosts? }
router.post('/api/clients/:clientId/automations/:automationId/regularizar-ipb', requireAuth, (req, res) => {
  const automation = getAutomation(req, res);
  if (!automation) return;
  if (req.params.automationId !== 'ipbusiness') {
    return res.status(400).json({ error: 'Solo disponible para ipbusiness' });
  }
  if (!botStatus.isEnabled(req.params.automationId)) {
    return res.status(403).json({ error: 'Bot inactivo. Actívalo primero desde el dashboard.' });
  }
  if (regIpb.enCurso) return res.status(409).json({ error: 'Ya hay una regularización en curso', estado: regIpb });

  const { fechas, error } = rangoFechas(req.body?.desde, req.body?.hasta, hoyLima());
  if (error) return res.status(400).json({ error });
  let ipbUrl;
  try { ipbUrl = envLib.read().IPB_URL || ''; } catch { ipbUrl = process.env.IPB_URL || ''; }
  const disponibles = ipbUrl.split(',').map(u => u.trim()).filter(Boolean).map(hostDe);
  const { hosts, error: errHosts } = validarHosts(req.body?.hosts, disponibles);
  if (errHosts) return res.status(400).json({ error: errHosts });

  regIpb = { enCurso: true, fechas, hosts, actual: null, resultados: [], inicio: new Date().toISOString(), fin: null };
  (async () => {
    for (const fecha of fechas) {
      regIpb.actual = fecha;
      console.log(`[regularizar-ipb] procesando ${fecha}${hosts ? ` (${hosts.join(', ')})` : ''}`);
      const r = await correrFechaIpb(automation.script, fecha, hosts);
      regIpb.resultados.push({ fecha, status: r.status, registrosValidos: r.registrosValidos ?? 0, error: r.error || null });
    }
    regIpb.actual = null;
    regIpb.enCurso = false;
    regIpb.fin = new Date().toISOString();
    console.log(`[regularizar-ipb] terminado: ${fechas.length} fecha(s)`);
  })();

  res.status(202).json({ ok: true, fechas, hosts });
});

// GET /api/clients/:clientId/automations/:automationId/regularizar-ipb — avance
router.get('/api/clients/:clientId/automations/:automationId/regularizar-ipb', requireAuth, (req, res) => {
  const automation = getAutomation(req, res);
  if (!automation) return;
  res.json(regIpb);
});

// GET /api/mfa/mibanco — estado actual del challenge MFA
router.get('/api/mfa/mibanco', requireAuth, (req, res) => {
  res.json(mfaLib.readState() || { status: 'idle' });
});

// POST /api/mfa/mibanco — usuario envía el código OTP
router.post('/api/mfa/mibanco', requireAuth, (req, res) => {
  const { code } = req.body;
  if (!code || typeof code !== 'string' || !code.trim()) {
    return res.status(400).json({ error: 'Código inválido' });
  }
  mfaLib.resolveWithCode(code.trim());
  res.json({ ok: true });
});

// GET /api/screenshot/:filename — sirve PNG de descargas/ con auth
router.get('/api/screenshot/:filename', requireAuth, (req, res) => {
  const name = req.params.filename;
  if (!/^[A-Za-z0-9_-]+\.png$/.test(name)) {
    return res.status(400).json({ error: 'Nombre inválido' });
  }
  const allowed = /^(error_|mibanco_|surgir_)/.test(name);
  if (!allowed) return res.status(403).json({ error: 'Prefijo no permitido' });
  const file = path.join(ROOT, 'descargas', name);
  if (!fs.existsSync(file)) return res.status(404).json({ error: 'No existe' });
  res.sendFile(file);
});

// GET /api/clients/:clientId/automations/:automationId/history
router.get('/api/clients/:clientId/automations/:automationId/history', requireAuth, (req, res) => {
  const automation = getAutomation(req, res);
  if (!automation) return;
  try {
    if (automation.historyFile && fs.existsSync(automation.historyFile)) {
      return res.json({ history: JSON.parse(fs.readFileSync(automation.historyFile, 'utf8')) });
    }
  } catch {}
  res.json({ history: [] });
});

// GET /api/clients/:clientId/automations/:automationId/config
router.get('/api/clients/:clientId/automations/:automationId/config', requireAuth, (req, res) => {
  const automation = getAutomation(req, res);
  if (!automation) return;

  const envVars = envLib.read();
  const config = automation.configSchema.map(field => ({
    key: field.key,
    label: field.label,
    type: field.type,
    secret: field.secret,
    value: field.secret ? '' : (envVars[field.key] || ''),
  }));

  res.json({ config });
});

// PUT /api/clients/:clientId/automations/:automationId/config
router.put('/api/clients/:clientId/automations/:automationId/config', requireAuth, (req, res) => {
  const automation = getAutomation(req, res);
  if (!automation) return;

  const { updates } = req.body;
  if (!updates || typeof updates !== 'object') {
    return res.status(400).json({ error: 'Formato inválido' });
  }

  const allowedKeys = new Set(automation.configSchema.map(f => f.key));
  for (const [key, value] of Object.entries(updates)) {
    if (!allowedKeys.has(key) || typeof value !== 'string') continue;
    const field = automation.configSchema.find(f => f.key === key);
    if (field.secret && value.trim() === '') continue;
    envLib.set(key, value);
  }

  scheduler.start();
  res.json({ ok: true });
});

function validarRerunServerBody(body) {
  if (!body || typeof body !== 'object') return 'Body inválido';
  const { host, user, fecha, campaigns } = body;
  if (!host || typeof host !== 'string') return 'host requerido';
  if (!user || typeof user !== 'string') return 'user requerido';
  if (!/^\d{8}$/.test(String(fecha || ''))) return 'fecha debe ser yyyyMMdd';
  if (!Array.isArray(campaigns) || campaigns.length === 0) return 'campaigns requerido';
  if (!campaigns.every(c => Number.isInteger(c) && c > 0)) return 'campaigns deben ser enteros positivos';
  return null;
}

function validarRerunIpbBody(body) {
  if (!body || typeof body !== 'object') return 'Body inválido';
  const { host, fecha } = body;
  if (!host || typeof host !== 'string' || !/^[\w.-]+(:\d+)?$/.test(host)) return 'host inválido';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(fecha || ''))) return 'fecha debe ser yyyy-MM-dd';
  return null;
}

module.exports = router;
module.exports.validarRerunServerBody = validarRerunServerBody;
module.exports.validarRerunIpbBody = validarRerunIpbBody;
