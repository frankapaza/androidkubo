// Crea o actualiza un usuario del panel web.
// Uso: node web/seed.js --username <usuario> --password <clave> --clientId <contactoeficaz|...>
const bcrypt = require('bcryptjs');
const clients = require('./lib/clients');
const users = require('./lib/users');

async function main() {
  const args = process.argv.slice(2);
  const get = flag => { const i = args.indexOf(flag); return i !== -1 ? args[i + 1] : null; };

  const username = get('--username');
  const password = get('--password');
  const clientId = get('--clientId');
  const role     = get('--role') || 'client';

  if (!username || !password) {
    console.log('Uso: node web/seed.js --username <usuario> --password <clave> [--clientId <id>] [--role admin|client]');
    console.log('Clientes disponibles:', Object.keys(clients).join(', '));
    process.exit(1);
  }

  if (role === 'client' && clientId && !clients[clientId]) {
    console.error(`clientId inválido. Opciones: ${Object.keys(clients).join(', ')}`);
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, 10);
  users.upsert({ id: username, username, passwordHash, clientId: clientId || null, role });
  console.log(`✓ Usuario "${username}" → rol "${role}"${clientId ? ` → cliente "${clientId}"` : ''} listo.`);
}

main().catch(err => { console.error(err.message); process.exit(1); });
