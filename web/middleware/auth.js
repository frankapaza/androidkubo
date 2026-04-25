const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../lib/config');

function requireAuth(req, res, next) {
  const token =
    req.cookies?.token ||
    (req.headers.authorization?.startsWith('Bearer ') && req.headers.authorization.slice(7));

  if (!token) {
    return req.path.startsWith('/api/')
      ? res.status(401).json({ error: 'No autorizado' })
      : res.redirect('/login');
  }

  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return req.path.startsWith('/api/')
      ? res.status(401).json({ error: 'Token inválido o expirado' })
      : res.redirect('/login');
  }
}

function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (req.user?.role !== 'admin') {
      return req.path.startsWith('/api/')
        ? res.status(403).json({ error: 'Solo administradores' })
        : res.redirect('/dashboard');
    }
    next();
  });
}

module.exports = { requireAuth, requireAdmin };
