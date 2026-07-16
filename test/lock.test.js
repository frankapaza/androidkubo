const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { acquireLock, releaseLock, esVencido, leerLock } = require('../src/shared/ingesta/lock');

function tmpLock() {
  return path.join(os.tmpdir(), `wv-lock-test-${process.pid}-${Math.random().toString(36).slice(2)}.json`);
}

test('esVencido: true si no existe o si supera el ttl', () => {
  assert.strictEqual(esVencido(null, 1000, 5000), true);
  assert.strictEqual(esVencido({ startedAt: 1000 }, 1000, 2500), true);   // 1500 > 1000
  assert.strictEqual(esVencido({ startedAt: 1000 }, 5000, 2500), false);  // 1500 < 5000
});

test('acquireLock toma el candado cuando está libre y release lo borra', async () => {
  const lp = tmpLock();
  try {
    const release = await acquireLock({ lockPath: lp });
    assert.ok(fs.existsSync(lp), 'lockfile creado');
    release();
    assert.ok(!fs.existsSync(lp), 'lockfile borrado');
  } finally { try { fs.unlinkSync(lp); } catch {} }
});

test('acquireLock hace timeout si está tomado por un candado fresco', async () => {
  const lp = tmpLock();
  try {
    let t = 1000;
    const now = () => t;
    const sleep = async (ms) => { t += ms; };
    // candado fresco pre-existente
    fs.writeFileSync(lp, JSON.stringify({ pid: 999, token: 'otro', startedAt: 1000 }));
    await assert.rejects(
      acquireLock({ lockPath: lp, ttlMs: 100000, pollMs: 5000, maxWaitMs: 20000, now, sleep }),
      /timeout esperando el candado/
    );
  } finally { try { fs.unlinkSync(lp); } catch {} }
});

test('acquireLock toma un candado vencido (takeover)', async () => {
  const lp = tmpLock();
  try {
    const now = () => 1000000;
    // candado viejo (vencido): startedAt muy atrás
    fs.writeFileSync(lp, JSON.stringify({ pid: 999, token: 'viejo', startedAt: 1 }));
    const release = await acquireLock({ lockPath: lp, ttlMs: 1000, now });
    const actual = leerLock(lp);
    assert.notStrictEqual(actual.token, 'viejo', 'tomó el candado con token propio');
    release();
  } finally { try { fs.unlinkSync(lp); } catch {} }
});

test('releaseLock solo borra si el token coincide', () => {
  const lp = tmpLock();
  try {
    fs.writeFileSync(lp, JSON.stringify({ token: 'mio', startedAt: Date.now() }));
    releaseLock(lp, 'ajeno');
    assert.ok(fs.existsSync(lp), 'no borra con token distinto');
    releaseLock(lp, 'mio');
    assert.ok(!fs.existsSync(lp), 'borra con token propio');
  } finally { try { fs.unlinkSync(lp); } catch {} }
});
