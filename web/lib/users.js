const fs = require('fs');
const path = require('path');
const USERS_FILE = path.join(__dirname, '../data/users.json');

function getAll() {
  if (!fs.existsSync(USERS_FILE)) return [];
  return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
}

function findByUsername(username) {
  return getAll().find(u => u.username === username) || null;
}

function save(users) {
  fs.mkdirSync(path.dirname(USERS_FILE), { recursive: true });
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

function upsert(user) {
  const users = getAll();
  const i = users.findIndex(u => u.username === user.username);
  if (i !== -1) users[i] = user; else users.push(user);
  save(users);
}

module.exports = { getAll, findByUsername, upsert };
