const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../lib/config');
const users = require('../lib/users');
const { renderLogin } = require('../views/login');

const router = express.Router();

// GET /login — página de login, también recibe ?token= para auto-login
router.get('/login', (req, res) => {
  const { token } = req.query;
  if (token) {
    try {
      const payload = jwt.verify(token, JWT_SECRET);
      res.cookie('token', token, {
        httpOnly: true,
        sameSite: 'lax',
        secure: true,
        maxAge: 8 * 3600 * 1000,
      });
      return res.redirect(payload.role === 'admin' ? '/admin' : '/dashboard');
    } catch {
      return res.redirect('/login?error=token_invalido');
    }
  }
  res.send(renderLogin(req.query.error));
});

// POST /api/auth/login — devuelve JWT (usado por el formulario y por sistemas externos)
router.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Faltan credenciales' });
  }
  const user = users.findByUsername(username);
  if (!user) return res.status(401).json({ error: 'Credenciales inválidas' });

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) return res.status(401).json({ error: 'Credenciales inválidas' });

  const role = user.role || 'client';
  const token = jwt.sign(
    { userId: user.id, username: user.username, clientId: user.clientId, role },
    JWT_SECRET,
    { expiresIn: '8h' }
  );
  res.json({ token, clientId: user.clientId, role });
});

// GET /api/auth/token?username=x&password=y — devuelve JWT para que el sistema externo redirija al dashboard
// Uso desde sistema externo:
//   1. GET /api/auth/token?username=contactoeficaz&password=xxx  →  { token: "eyJ..." }
//   2. Redirigir navegador a: /login?token=eyJ...                →  queda logueado automáticamente
router.get('/api/auth/token', async (req, res) => {
  const { username, password } = req.query;
  if (!username || !password) {
    return res.status(400).json({ error: 'Faltan username y password como query params' });
  }
  const user = users.findByUsername(username);
  if (!user) return res.status(401).json({ error: 'Credenciales inválidas' });

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) return res.status(401).json({ error: 'Credenciales inválidas' });

  const role = user.role || 'client';
  const token = jwt.sign(
    { userId: user.id, username: user.username, clientId: user.clientId, role },
    JWT_SECRET,
    { expiresIn: '1h' }
  );
  const redirectUrl = `/login?token=${token}`;
  res.json({ token, redirectUrl });
});

// POST /logout
router.post('/logout', (req, res) => {
  res.clearCookie('token');
  res.redirect('/login');
});

module.exports = router;
