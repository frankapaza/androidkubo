const express = require('express');
const cookieParser = require('cookie-parser');
const { PORT } = require('./lib/config');
const authRoutes = require('./routes/auth');
const dashboardRoutes = require('./routes/dashboard');
const adminRoutes = require('./routes/admin');
const scheduler = require('./lib/scheduler');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

app.use('/', authRoutes);
app.use('/', adminRoutes);
app.use('/', dashboardRoutes);
app.get('/', (req, res) => res.redirect('/dashboard'));

app.listen(PORT, () => {
  console.log(`[kubot-web] http://localhost:${PORT}`);
  scheduler.start();
});

module.exports = app;
