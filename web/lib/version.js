const { execSync } = require('child_process');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');

let cached = null;

function read() {
  if (cached) return cached;
  try {
    const cwd = ROOT;
    const opts = { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] };
    const sha = execSync('git rev-parse --short HEAD', opts).trim();
    const count = parseInt(
      execSync('git rev-list --count HEAD', opts).trim(),
      10
    );
    const isoDate = execSync('git log -1 --format=%cI HEAD', opts).trim();
    cached = {
      version: `v1.${count}`,
      commit: sha,
      deployDate: isoDate || null,
    };
  } catch {
    cached = { version: 'v?', commit: 'unknown', deployDate: null };
  }
  return cached;
}

module.exports = { read };
