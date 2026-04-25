const express = require('express');
const bcrypt = require('bcryptjs');
const { requireAdmin } = require('../middleware/auth');
const clients = require('../lib/clients');
const users = require('../lib/users');
const { renderAdmin } = require('../views/admin');
const { renderDashboard } = require('../views/dashboard');

const router = express.Router();

const clientOptions = Object.entries(clients).map(([id, c]) => [id, c.displayName]);

// GET /admin — panel de administración
router.get('/admin', requireAdmin, (req, res) => {
  res.send(renderAdmin(req.user, clientOptions));
});

// GET /admin/view/:clientId — admin ve el dashboard del cliente (solo lectura con botón volver)
router.get('/admin/view/:clientId', requireAdmin, (req, res) => {
  const client = clients[req.params.clientId];
  if (!client) return res.redirect('/admin');
  const fs = require('fs');
  const lastRuns = {};
  for (const [id, automation] of Object.entries(client.automations)) {
    try {
      if (fs.existsSync(automation.lastRunFile)) {
        lastRuns[id] = JSON.parse(fs.readFileSync(automation.lastRunFile, 'utf8'));
      }
    } catch {}
  }
  res.send(renderDashboard(req.user, client, lastRuns, { isAdminView: true, viewClientId: req.params.clientId }));
});

// GET /api/admin/users — lista todos los usuarios (sin passwordHash)
router.get('/api/admin/users', requireAdmin, (req, res) => {
  const all = users.getAll().map(({ passwordHash, ...rest }) => rest);
  res.json({ users: all });
});

// POST /api/admin/users — crea un usuario
router.post('/api/admin/users', requireAdmin, async (req, res) => {
  const { username, password, clientId, role } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'username y password son obligatorios' });
  }
  if (role === 'client' && clientId && !clients[clientId]) {
    return res.status(400).json({ error: `clientId inválido: ${clientId}` });
  }
  const passwordHash = await bcrypt.hash(password, 10);
  users.upsert({
    id: username,
    username,
    passwordHash,
    clientId: clientId || null,
    role: role || 'client',
  });
  res.json({ ok: true });
});

// PUT /api/admin/users/:username/password — cambia la contraseña
router.put('/api/admin/users/:username/password', requireAdmin, async (req, res) => {
  const { password } = req.body;
  if (!password) return res.status(400).json({ error: 'Falta password' });
  const user = users.findByUsername(req.params.username);
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
  const passwordHash = await bcrypt.hash(password, 10);
  users.upsert({ ...user, passwordHash });
  res.json({ ok: true });
});

// DELETE /api/admin/users/:username — elimina un usuario
router.delete('/api/admin/users/:username', requireAdmin, (req, res) => {
  const target = users.findByUsername(req.params.username);
  if (!target) return res.status(404).json({ error: 'Usuario no encontrado' });
  if (target.role === 'admin') return res.status(403).json({ error: 'No se puede eliminar un administrador' });
  const all = users.getAll().filter(u => u.username !== req.params.username);
  users.save(all);
  res.json({ ok: true });
});

module.exports = router;
