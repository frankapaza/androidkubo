const express = require('express');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { requireAuth } = require('../middleware/auth');
const clients = require('../lib/clients');
const envLib = require('../lib/env');
const scheduler = require('../lib/scheduler');
const { renderDashboard } = require('../views/dashboard');

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
  for (const [id, automation] of Object.entries(client.automations)) {
    lastRuns[id] = readLastRun(automation);
  }

  res.send(renderDashboard(req.user, client, lastRuns));
});

// GET /api/clients/:clientId/automations/:automationId/status
router.get('/api/clients/:clientId/automations/:automationId/status', requireAuth, (req, res) => {
  const automation = getAutomation(req, res);
  if (!automation) return;
  res.json({ lastRun: readLastRun(automation) });
});

// POST /api/clients/:clientId/automations/:automationId/rerun
router.post('/api/clients/:clientId/automations/:automationId/rerun', requireAuth, (req, res) => {
  const automation = getAutomation(req, res);
  if (!automation) return;

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
