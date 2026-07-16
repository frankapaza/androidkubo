// Candado de ejecución entre procesos, basado en un lockfile (mismo host).
// Garantiza que solo una corrida de Wolkvox toque CARGA.TMP_GESTION a la vez.
const fs = require('fs');

function leerLock(lockPath) {
  try { return JSON.parse(fs.readFileSync(lockPath, 'utf8')); } catch { return null; }
}

function esVencido(lock, ttlMs, ahora) {
  if (!lock || typeof lock.startedAt !== 'number') return true;
  return (ahora - lock.startedAt) > ttlMs;
}

const dormir = ms => new Promise(r => setTimeout(r, ms));

// Crea el lockfile atómicamente (flag 'wx' falla si ya existe). true si lo tomó.
function intentarCrear(lockPath, contenido) {
  try {
    fs.writeFileSync(lockPath, JSON.stringify(contenido), { flag: 'wx' });
    return true;
  } catch (e) {
    if (e.code === 'EEXIST') return false;
    throw e;
  }
}

// Espera su turno y toma el candado. Devuelve release(); lanza si supera maxWaitMs.
async function acquireLock({
  lockPath, ttlMs = 1200000, pollMs = 5000, maxWaitMs = 900000,
  mode = 'normal', label = '', now = () => Date.now(), sleep = dormir,
}) {
  const token = `${process.pid}-${now()}-${Math.floor(Math.random() * 1e9)}`;
  const inicio = now();
  for (;;) {
    if (intentarCrear(lockPath, { pid: process.pid, token, mode, label, startedAt: now() })) {
      return () => releaseLock(lockPath, token);
    }
    const actual = leerLock(lockPath);
    if (esVencido(actual, ttlMs, now())) {
      try { fs.unlinkSync(lockPath); } catch {}
      continue; // reintenta crear
    }
    if ((now() - inicio) >= maxWaitMs) {
      throw new Error(`[lock] timeout esperando el candado tras ${Math.round((now() - inicio) / 1000)}s (${lockPath})`);
    }
    await sleep(pollMs);
  }
}

// Borra el lockfile solo si el token coincide (no pisar el de otro tras un takeover).
function releaseLock(lockPath, token) {
  const actual = leerLock(lockPath);
  if (actual && actual.token === token) {
    try { fs.unlinkSync(lockPath); } catch {}
  }
}

module.exports = { acquireLock, releaseLock, esVencido, leerLock };
