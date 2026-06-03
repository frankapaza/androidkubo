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

// PUT /api/clients/:clientId/automations/:automationId/toggle
router.put('/api/clients/:clientId/automations/:automationId/toggle', requireAuth, (req, res) => {
  const automation = getAutomation(req, res);
  if (!automation) return;
  const { enabled } = req.body;
  if (typeof enabled !== 'boolean') return res.status(400).json({ error: 'enabled debe ser boolean' });
  botStatus.setEnabled(req.params.automationId, enabled);
  res.json({ ok: true, enabled });
});

// POST /api/clients/:clientId/automations/:automationId/rerun
router.post('/api/clients/:clientId/automations/:automationId/rerun', requireAuth, (req, res) => {
  const automation = getAutomation(req, res);
  if (!automation) return;

  if (!botStatus.isEnabled(req.params.automationId)) {
    return res.status(403).json({ error: 'Bot inactivo. Actívalo primero desde el dashboard.' });
  }

  if (req.body?.skipSchedule) {
    scheduler.markSkipToday(req.params.automationId);
  }

  req.socket.setTimeout(10 * 60 * 1000);

  const proc = spawn('node', [automation.script], {
    env: { ...process.env },
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

// GET /api/debug/bot-status — muestra el estado actual del archivo bot_status.json (solo admin)
router.get('/api/debug/bot-status', requireAuth, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Solo admins' });
  const STATUS_FILE = path.resolve(__dirname, '../../descargas/bot_status.json');
  const LOG_FILE    = path.resolve(__dirname, '../../logs/kubot-web.out.log');
  const exists = fs.existsSync(STATUS_FILE);
  let content = null;
  if (exists) { try { content = JSON.parse(fs.readFileSync(STATUS_FILE, 'utf8')); } catch (e) { content = { parseError: e.message }; } }
  let lastLogs = [];
  try {
    if (fs.existsSync(LOG_FILE)) {
      const lines = fs.readFileSync(LOG_FILE, 'utf8').split('\n');
      lastLogs = lines.filter(l => l.includes('[bot-status]')).slice(-50);
    }
  } catch {}
  res.json({ statusFilePath: STATUS_FILE, exists, content, lastLogs });
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

module.exports = router;
