const fs = require('fs');
const path = require('path');
const ENV_PATH = path.resolve(__dirname, '../../.env');

function read() {
  const content = fs.readFileSync(ENV_PATH, 'utf8');
  const vars = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    vars[key] = val;
  }
  return vars;
}

function set(key, value) {
  const content = fs.readFileSync(ENV_PATH, 'utf8');
  const lines = content.split('\n');
  let found = false;
  const updated = lines.map(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return line;
    const eq = trimmed.indexOf('=');
    if (eq === -1) return line;
    const k = trimmed.slice(0, eq).trim();
    if (k !== key) return line;
    found = true;
    const needsQuotes = /[#$\s"'\\]/.test(value);
    return `${key}=${needsQuotes ? `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"` : value}`;
  });
  if (!found) updated.push(`${key}=${value}`);
  fs.writeFileSync(ENV_PATH, updated.join('\n'));
  // Sync to current process so spawned children inherit the updated value
  process.env[key] = value;
}

module.exports = { read, set };
