# Wolkvox: reintento + reconciliación por campaña — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que la ingesta Wolkvox reintente campañas que fallan o vienen vacías, reconcilie por campaña con resumen por servidor, y permita re-ejecutar manualmente las campañas pendientes de un servidor desde el panel.

**Architecture:** Se añade un SP companion que lista (servidor+campaña) reales. `wolkvox.js` itera solo campañas reales, con reintento y clasificación (ok/vacío/error), y arma `estado.reconciliacion`. Un modo dirigido (env `WOLKVOX_ONLY_*`) re-ejecuta campañas puntuales y parchea la reconciliación persistida. El panel muestra una tabla por servidor con un botón "Reintentar pendientes" que llama a un nuevo endpoint.

**Tech Stack:** Node.js ≥18 (runtime v22), `mssql`, `express`, `nodemailer`, runner de pruebas nativo `node --test` + `node:assert` (sin dependencias nuevas). SQL Server (BD_MCOB).

## Global Constraints

- **Sin dependencias nuevas.** Solo `node:test`/`node:assert` para pruebas.
- **Node ≥18** (ya declarado en `package.json` engines).
- **Zona horaria:** toda lógica de fecha/día usa `America/Lima`.
- **No usar `DRY_RUN`** como bandera: el `.env` la fija en `false`. La prueba sin escritura usa `WOLKVOX_DRY_INGESTA`.
- **Literales de BD:** `BD_MCOB` (origen), `BD_MSEG` (usuarios), esquema `ASTERISK`/`CONFIGURACION`.
- **Alcance:** solo automation `wolkvox`. Re-ejecución siempre manual.
- **Commits:** terminar el mensaje con `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- **Rama de trabajo:** `feat/wolkvox-reintento-reconciliacion`.
- Defaults de reintento: `WOLKVOX_MAX_REINTENTOS=2`, `WOLKVOX_BACKOFF_MS=1500`.

---

## File Structure

- **Create** `sql_scripts/NN_sp_listar_asterisk_servidor_campana.sql` — SP companion (una fila por servidor+campaña).
- **Create** `src/shared/ingesta/wolkvox-fetch.js` — `intentarCampana`, `fetchCampanaConReintento`, `sleep`.
- **Create** `src/clientes/contactoeficaz/ingesta/reconciliacion.js` — `esDiaHabilLima`, `construirReconciliacion`, `calcularStatus`, `parchearReconciliacion`, `yyyymmddToDisplay`.
- **Modify** `src/shared/ingesta/mcob.js` — añadir `listarServidoresConCampanas`.
- **Modify** `src/clientes/contactoeficaz/ingesta/wolkvox.js` — usar helpers, modo normal (reconciliación) + modo dirigido.
- **Modify** `src/shared/ingesta/notificar.js` — soportar `status: 'warning'` + bloque por servidor/pendientes.
- **Modify** `web/routes/dashboard.js` — endpoint `POST .../rerun-server` + `validarRerunServerBody`.
- **Modify** `web/views/dashboard.js` — `renderServidoresTabla` + función cliente `rerunServer` + integración en la tarjeta.
- **Create** `test/wolkvox-fetch.test.js`, `test/reconciliacion.test.js`, `test/notificar.test.js`, `test/rerun-server-validacion.test.js`, `test/render-servidores.test.js`.
- **Modify** `package.json` — script `"test": "node --test"`.
- **Create** `scripts/verif-sp-campana.js` — verificación read-only del SP companion.

---

## Task 1: Runner de pruebas

**Files:**
- Modify: `package.json`
- Create: `test/smoke.test.js`

- [ ] **Step 1: Añadir el script de test**

En `package.json`, dentro de `"scripts"`, añadir después de `"web:seed"`:

```json
    "test": "node --test",
```

- [ ] **Step 2: Crear un test smoke**

`test/smoke.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert');

test('runner operativo', () => {
  assert.strictEqual(1 + 1, 2);
});
```

- [ ] **Step 3: Correr y verificar que pasa**

Run: `npm test`
Expected: `# pass 1` (exit 0).

- [ ] **Step 4: Commit**

```bash
git add package.json test/smoke.test.js
git commit -m "test: habilitar runner nativo node --test

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: SP companion `SP_LISTAR_ASTERISK_SERVIDOR_CAMPANA`

**Files:**
- Create: `sql_scripts/NN_sp_listar_asterisk_servidor_campana.sql` (NN = siguiente número disponible en `sql_scripts/`)
- Create: `scripts/verif-sp-campana.js`

**Interfaces:**
- Produces: SP `ASTERISK.SP_LISTAR_ASTERISK_SERVIDOR_CAMPANA` que devuelve columnas
  `AMI_HOST_VC, AMI_USER_VC, AMI_PASS_VC, TIM_EJE_SI, ID_CAMP_PROV_EXT_SI` (una fila por servidor+campaña).

- [ ] **Step 1: Escribir el script SQL**

`sql_scripts/NN_sp_listar_asterisk_servidor_campana.sql`:

```sql
-- SP companion de ASTERISK.SP_LISTAR_ASTERISK_SERVIDOR.
-- Devuelve una fila por (servidor + campaña) con los MISMOS joins/filtros/ventana,
-- pero sin GROUP BY MIN/MAX: expone cada ID_CAMP_PROV_EXT_SI.
-- El SP original NO se modifica.
USE BD_MCOB;
GO
CREATE OR ALTER PROCEDURE ASTERISK.SP_LISTAR_ASTERISK_SERVIDOR_CAMPANA
AS
BEGIN
    SET NOCOUNT ON;
    SELECT T1.AMI_HOST_VC, T1.AMI_USER_VC, T1.AMI_PASS_VC, T1.TIM_EJE_SI,
           T0.ID_CAMP_PROV_EXT_SI
    FROM CONFIGURACION.TBL_CONFIGURACION T0
    INNER JOIN BD_MSEG.dbo.TBL_ASTERISK_SERVIDOR T1
        ON SUBSTRING(T1.AMI_USER_VC,1,20) = SUBSTRING(T0.SERV_PROV_EXT_VC,1,20)
    WHERE T0.FLG_EST_BO = 1
      AND T0.FLG_ACT_BO = 1
      AND CONVERT(DATE, T0.FEC_CRE_DT) > CONVERT(DATE, GETDATE()-3)
    GROUP BY T1.AMI_HOST_VC, T1.AMI_USER_VC, T1.AMI_PASS_VC, T1.TIM_EJE_SI,
             T0.ID_CAMP_PROV_EXT_SI;
END
GO
```

> Nota: usar `/sql-script` (skill `sql-script`) si se quiere la numeración/estructura estándar de `sql_scripts/`. El `GROUP BY` incluyendo la campaña colapsa duplicados de config a filas (servidor+campaña) únicas.

- [ ] **Step 2: Escribir el verificador read-only**

`scripts/verif-sp-campana.js`:

```js
// Read-only: valida que el SP companion es consistente con SP_LISTAR_ASTERISK_SERVIDOR.
// Para cada servidor, el MIN/MAX de campañas del SP companion debe coincidir con el rango del SP original.
require('dotenv').config();
const sql = require('mssql');

async function main() {
  const pool = await sql.connect({
    server: process.env.MCOB_DB_SERVER, database: process.env.MCOB_DB_DATABASE,
    user: process.env.MCOB_DB_USER, password: process.env.MCOB_DB_PASS,
    connectionTimeout: 20000, requestTimeout: 60000,
    options: { encrypt: false, trustServerCertificate: true, enableArithAbort: true },
  });

  const rango = (await pool.request().execute('ASTERISK.SP_LISTAR_ASTERISK_SERVIDOR')).recordset;
  const camps = (await pool.request().execute('ASTERISK.SP_LISTAR_ASTERISK_SERVIDOR_CAMPANA')).recordset;

  const porServidor = new Map();
  for (const c of camps) {
    const k = `${c.AMI_HOST_VC}|${c.AMI_USER_VC}|${c.TIM_EJE_SI}`;
    if (!porServidor.has(k)) porServidor.set(k, []);
    porServidor.get(k).push(c.ID_CAMP_PROV_EXT_SI);
  }

  let ok = true;
  for (const r of rango) {
    const k = `${r.AMI_HOST_VC}|${r.AMI_USER_VC}|${r.TIM_EJE_SI}`;
    const lista = porServidor.get(k) || [];
    const min = Math.min(...lista), max = Math.max(...lista);
    const cuadra = lista.length > 0 && min === r.CAMP_MIN_PROV_EXT && max === r.CAMP_MAX_PROV_EXT;
    if (!cuadra) ok = false;
    console.log(`${cuadra ? 'OK ' : 'XX '} ${r.AMI_HOST_VC} ${r.AMI_USER_VC}: companion=${lista.length} camp [${min}-${max}] vs rango [${r.CAMP_MIN_PROV_EXT}-${r.CAMP_MAX_PROV_EXT}]`);
  }
  await pool.close();
  console.log(ok ? '\nCONSISTENTE' : '\nINCONSISTENTE');
  process.exit(ok ? 0 : 1);
}
main().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
```

- [ ] **Step 3: Desplegar el SP y verificar** (manual — requiere ejecutar el DDL en `209.145.50.211`)

Ejecutar el `.sql` en la instancia (SSMS/sqlcmd con un login con permiso de ALTER en el esquema `ASTERISK`), luego:

Run: `node scripts/verif-sp-campana.js`
Expected: todas las líneas `OK ...` y `CONSISTENTE` (exit 0). Si sale `INCONSISTENTE`, revisar joins/ventana antes de continuar.

- [ ] **Step 4: Commit**

```bash
git add sql_scripts/NN_sp_listar_asterisk_servidor_campana.sql scripts/verif-sp-campana.js
git commit -m "feat(wolkvox): SP companion lista servidor+campaña + verificador

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: `listarServidoresConCampanas` en mcob.js

**Files:**
- Modify: `src/shared/ingesta/mcob.js`
- Test: `test/mcob-servidores.test.js`

**Interfaces:**
- Consumes: SP `ASTERISK.SP_LISTAR_ASTERISK_SERVIDOR_CAMPANA` (Task 2).
- Produces: `listarServidoresConCampanas(pool) => Promise<Array<{ host, user, token, timEje, campanas:number[] }>>`
  (una entrada por servidor; `campanas` únicas y ordenadas asc).

- [ ] **Step 1: Escribir el test**

`test/mcob-servidores.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert');
const { agruparServidoresCampanas } = require('../src/shared/ingesta/mcob');

test('agrupa filas (servidor+campaña) por servidor con campañas únicas y ordenadas', () => {
  const recordset = [
    { AMI_HOST_VC:'wv0064', AMI_USER_VC:'CE SANTANDER', AMI_PASS_VC:'tok1', TIM_EJE_SI:1, ID_CAMP_PROV_EXT_SI:17820 },
    { AMI_HOST_VC:'wv0064', AMI_USER_VC:'CE SANTANDER', AMI_PASS_VC:'tok1', TIM_EJE_SI:1, ID_CAMP_PROV_EXT_SI:17819 },
    { AMI_HOST_VC:'wv0064', AMI_USER_VC:'CE SANTANDER', AMI_PASS_VC:'tok1', TIM_EJE_SI:1, ID_CAMP_PROV_EXT_SI:17819 },
    { AMI_HOST_VC:'wv0057', AMI_USER_VC:'WOLKVOX', AMI_PASS_VC:'tok2', TIM_EJE_SI:2, ID_CAMP_PROV_EXT_SI:29283 },
  ];
  const out = agruparServidoresCampanas(recordset);
  assert.strictEqual(out.length, 2);
  const san = out.find(s => s.user === 'CE SANTANDER');
  assert.deepStrictEqual(san.campanas, [17819, 17820]);
  assert.strictEqual(san.host, 'wv0064');
  assert.strictEqual(san.token, 'tok1');
  assert.strictEqual(san.timEje, 1);
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `node --test test/mcob-servidores.test.js`
Expected: FAIL — `agruparServidoresCampanas is not a function`.

- [ ] **Step 3: Implementar**

En `src/shared/ingesta/mcob.js`, añadir antes de `module.exports`:

```js
// Agrupa el recordset de SP_LISTAR_ASTERISK_SERVIDOR_CAMPANA por servidor.
// Función pura (separada para poder testear sin BD).
function agruparServidoresCampanas(recordset) {
  const mapa = new Map();
  for (const r of recordset) {
    const k = `${r.AMI_HOST_VC}|${r.AMI_USER_VC}|${r.AMI_PASS_VC}|${r.TIM_EJE_SI}`;
    if (!mapa.has(k)) {
      mapa.set(k, { host: r.AMI_HOST_VC, user: r.AMI_USER_VC, token: r.AMI_PASS_VC, timEje: r.TIM_EJE_SI, _set: new Set() });
    }
    mapa.get(k)._set.add(r.ID_CAMP_PROV_EXT_SI);
  }
  return [...mapa.values()].map(s => ({
    host: s.host, user: s.user, token: s.token, timEje: s.timEje,
    campanas: [...s._set].sort((a, b) => a - b),
  }));
}

async function listarServidoresConCampanas(pool) {
  const res = await pool.request().execute('ASTERISK.SP_LISTAR_ASTERISK_SERVIDOR_CAMPANA');
  return agruparServidoresCampanas(res.recordset);
}
```

Y añadir ambos a `module.exports`:

```js
module.exports = {
  createPool,
  limpiarTmpGestiones,
  bulkRegistrarTmpGestiones,
  listarServidoresAsterisk,
  listarServidoresConCampanas,
  agruparServidoresCampanas,
  registrarGestiones,
  dedupGestionesVarios,
};
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `node --test test/mcob-servidores.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/shared/ingesta/mcob.js test/mcob-servidores.test.js
git commit -m "feat(wolkvox): listarServidoresConCampanas + agrupado testeable

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Fetch con reintento y clasificación

**Files:**
- Create: `src/shared/ingesta/wolkvox-fetch.js`
- Test: `test/wolkvox-fetch.test.js`

**Interfaces:**
- Produces:
  - `intentarCampana({ host, token, camp, fecha, fetchImpl }) => Promise<{ resultado:'ok'|'vacio'|'error', data:any[] }>`
  - `fetchCampanaConReintento({ intentar, maxReintentos, backoffMs, dormir }) => Promise<{ resultado, data, intentos }>`
    donde `intentar` es un thunk `() => Promise<{resultado,data}>`.

- [ ] **Step 1: Escribir los tests**

`test/wolkvox-fetch.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert');
const { intentarCampana, fetchCampanaConReintento } = require('../src/shared/ingesta/wolkvox-fetch');

const nodormir = async () => {};

test('reintenta tras error y luego devuelve ok', async () => {
  const cola = [
    { resultado: 'error', data: [] },
    { resultado: 'ok', data: [{ a: 1 }] },
  ];
  let i = 0;
  const r = await fetchCampanaConReintento({ intentar: async () => cola[i++], maxReintentos: 2, backoffMs: 1, dormir: nodormir });
  assert.strictEqual(r.resultado, 'ok');
  assert.strictEqual(r.intentos, 2);
  assert.strictEqual(r.data.length, 1);
});

test('vacío persistente agota reintentos y queda vacio', async () => {
  let intentos = 0;
  const r = await fetchCampanaConReintento({ intentar: async () => { intentos++; return { resultado: 'vacio', data: [] }; }, maxReintentos: 2, backoffMs: 1, dormir: nodormir });
  assert.strictEqual(r.resultado, 'vacio');
  assert.strictEqual(intentos, 3); // 1 inicial + 2 reintentos
});

test('error persistente queda error tras el tope', async () => {
  const r = await fetchCampanaConReintento({ intentar: async () => ({ resultado: 'error', data: [] }), maxReintentos: 2, backoffMs: 1, dormir: nodormir });
  assert.strictEqual(r.resultado, 'error');
  assert.strictEqual(r.intentos, 3);
});

test('intentarCampana clasifica 200 con data como ok', async () => {
  const fakeFetch = async () => ({ ok: true, json: async () => ({ data: [{ x: 1 }] }) });
  const r = await intentarCampana({ host: 'h', token: 't', camp: 1, fecha: '20260703', fetchImpl: fakeFetch });
  assert.strictEqual(r.resultado, 'ok');
});

test('intentarCampana clasifica 200 vacío como vacio', async () => {
  const fakeFetch = async () => ({ ok: true, json: async () => ({ data: [] }) });
  const r = await intentarCampana({ host: 'h', token: 't', camp: 1, fecha: '20260703', fetchImpl: fakeFetch });
  assert.strictEqual(r.resultado, 'vacio');
});

test('intentarCampana clasifica !ok y json.error y excepción como error', async () => {
  const noOk = await intentarCampana({ host:'h', token:'t', camp:1, fecha:'20260703', fetchImpl: async () => ({ ok:false }) });
  assert.strictEqual(noOk.resultado, 'error');
  const jerr = await intentarCampana({ host:'h', token:'t', camp:1, fecha:'20260703', fetchImpl: async () => ({ ok:true, json: async () => ({ error:'x' }) }) });
  assert.strictEqual(jerr.resultado, 'error');
  const thr = await intentarCampana({ host:'h', token:'t', camp:1, fecha:'20260703', fetchImpl: async () => { throw new Error('net'); } });
  assert.strictEqual(thr.resultado, 'error');
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `node --test test/wolkvox-fetch.test.js`
Expected: FAIL — módulo inexistente.

- [ ] **Step 3: Implementar**

`src/shared/ingesta/wolkvox-fetch.js`:

```js
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function intentarCampana({ host, token, camp, fecha, fetchImpl = fetch }) {
  const url = `https://${host}.wolkvox.com/api/v2/reports_manager.php` +
    `?api=campaign_3&campaign_id=${camp}&date_ini=${fecha}000000&date_end=${fecha}235959`;
  try {
    const res = await fetchImpl(url, { headers: { Accept: 'application/json', 'wolkvox-token': token } });
    if (!res.ok) return { resultado: 'error', data: [] };
    const json = await res.json();
    if (json.error) return { resultado: 'error', data: [] };
    const data = Array.isArray(json.data) ? json.data : [];
    return { resultado: data.length ? 'ok' : 'vacio', data };
  } catch {
    return { resultado: 'error', data: [] };
  }
}

// Reintenta mientras el resultado sea 'error' o 'vacio', hasta maxReintentos veces.
async function fetchCampanaConReintento({ intentar, maxReintentos = 2, backoffMs = 1500, dormir = sleep }) {
  let ultimo = { resultado: 'error', data: [] };
  for (let intento = 0; intento <= maxReintentos; intento++) {
    if (intento > 0) await dormir(intento * backoffMs);
    ultimo = await intentar();
    if (ultimo.resultado === 'ok') return { ...ultimo, intentos: intento + 1 };
  }
  return { ...ultimo, intentos: maxReintentos + 1 };
}

module.exports = { sleep, intentarCampana, fetchCampanaConReintento };
```

- [ ] **Step 4: Correr y verificar que pasa**

Run: `node --test test/wolkvox-fetch.test.js`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/shared/ingesta/wolkvox-fetch.js test/wolkvox-fetch.test.js
git commit -m "feat(wolkvox): fetch por campaña con reintento y clasificación ok/vacio/error

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: Reconciliación y día hábil

**Files:**
- Create: `src/clientes/contactoeficaz/ingesta/reconciliacion.js`
- Test: `test/reconciliacion.test.js`

**Interfaces:**
- Produces:
  - `esDiaHabilLima(date?) => boolean`
  - `construirReconciliacion(servidores, { diaHabil }) => { servidores, totalPendientes, diaHabil }`
    donde cada `servidores[i]` de entrada es `{ host, user, timEje, resultados:[{camp,raw,validos,resultado}] }`.
  - `calcularStatus(totalPendientes, diaHabil) => 'ok'|'warning'`
  - `yyyymmddToDisplay(f) => 'DD/MM/YYYY'`
  - `parchearReconciliacion(history, { fecha, host, user, recuperadas:[{camp,validos,raw}] }) => { history, patched }`

- [ ] **Step 1: Escribir los tests**

`test/reconciliacion.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert');
const {
  esDiaHabilLima, construirReconciliacion, calcularStatus, yyyymmddToDisplay, parchearReconciliacion,
} = require('../src/clientes/contactoeficaz/ingesta/reconciliacion');

test('esDiaHabilLima: sábado es no hábil, viernes es hábil', () => {
  // 2026-07-04 12:00Z = sábado 07:00 Lima; 2026-07-03 12:00Z = viernes.
  assert.strictEqual(esDiaHabilLima(new Date('2026-07-04T12:00:00Z')), false);
  assert.strictEqual(esDiaHabilLima(new Date('2026-07-03T12:00:00Z')), true);
});

test('construirReconciliacion arma pendientes y contadores', () => {
  const servidores = [{
    host: 'wv0064', user: 'CE SANTANDER', timEje: 1,
    resultados: [
      { camp: 17798, raw: 100, validos: 90, resultado: 'ok' },
      { camp: 17819, raw: 0, validos: 0, resultado: 'vacio' },
      { camp: 17820, raw: 0, validos: 0, resultado: 'error' },
    ],
  }];
  const rec = construirReconciliacion(servidores, { diaHabil: true });
  assert.strictEqual(rec.totalPendientes, 2);
  const s = rec.servidores[0];
  assert.strictEqual(s.campanasTotal, 3);
  assert.strictEqual(s.conData, 1);
  assert.strictEqual(s.registrosValidos, 90);
  assert.deepStrictEqual(s.pendientes, [{ camp: 17819, resultado: 'vacio' }, { camp: 17820, resultado: 'error' }]);
});

test('calcularStatus: warning solo con pendientes en día hábil', () => {
  assert.strictEqual(calcularStatus(2, true), 'warning');
  assert.strictEqual(calcularStatus(2, false), 'ok');
  assert.strictEqual(calcularStatus(0, true), 'ok');
});

test('yyyymmddToDisplay', () => {
  assert.strictEqual(yyyymmddToDisplay('20260703'), '03/07/2026');
});

test('parchearReconciliacion mueve recuperadas fuera de pendientes', () => {
  const history = [{
    fechaReporte: '03/07/2026',
    reconciliacion: {
      totalPendientes: 2,
      servidores: [{
        host: 'wv0064', user: 'CE SANTANDER', turno: 1, campanasTotal: 3, conData: 1,
        registrosRaw: 100, registrosValidos: 90,
        pendientes: [{ camp: 17819, resultado: 'vacio' }, { camp: 17820, resultado: 'error' }],
      }],
    },
  }];
  const { history: h2, patched } = parchearReconciliacion(history, {
    fecha: '20260703', host: 'wv0064', user: 'CE SANTANDER',
    recuperadas: [{ camp: 17819, validos: 50, raw: 60 }],
  });
  assert.strictEqual(patched, true);
  const s = h2[0].reconciliacion.servidores[0];
  assert.deepStrictEqual(s.pendientes, [{ camp: 17820, resultado: 'error' }]);
  assert.strictEqual(s.conData, 2);
  assert.strictEqual(s.registrosValidos, 140);
  assert.strictEqual(h2[0].reconciliacion.totalPendientes, 1);
});

test('parchearReconciliacion no toca entradas de otra fecha', () => {
  const history = [{ fechaReporte: '01/07/2026', reconciliacion: { totalPendientes: 1, servidores: [{ host:'wv0064', user:'CE SANTANDER', pendientes:[{camp:17819,resultado:'error'}], conData:0, registrosRaw:0, registrosValidos:0 }] } }];
  const { patched } = parchearReconciliacion(history, { fecha: '20260703', host:'wv0064', user:'CE SANTANDER', recuperadas:[{camp:17819,validos:1,raw:1}] });
  assert.strictEqual(patched, false);
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `node --test test/reconciliacion.test.js`
Expected: FAIL — módulo inexistente.

- [ ] **Step 3: Implementar**

`src/clientes/contactoeficaz/ingesta/reconciliacion.js`:

```js
function esDiaHabilLima(date = new Date()) {
  const wd = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Lima', weekday: 'short' }).format(date);
  return wd !== 'Sat' && wd !== 'Sun';
}

function construirReconciliacion(servidores, { diaHabil }) {
  const out = servidores.map(s => {
    const pendientes = s.resultados
      .filter(r => r.resultado !== 'ok')
      .map(r => ({ camp: r.camp, resultado: r.resultado }));
    return {
      host: s.host, user: s.user, turno: s.timEje,
      campanasTotal: s.resultados.length,
      conData: s.resultados.filter(r => r.resultado === 'ok').length,
      registrosRaw: s.resultados.reduce((a, r) => a + (r.raw || 0), 0),
      registrosValidos: s.resultados.reduce((a, r) => a + (r.validos || 0), 0),
      pendientes,
    };
  });
  const totalPendientes = out.reduce((a, s) => a + s.pendientes.length, 0);
  return { servidores: out, totalPendientes, diaHabil };
}

function calcularStatus(totalPendientes, diaHabil) {
  return totalPendientes > 0 && diaHabil ? 'warning' : 'ok';
}

function yyyymmddToDisplay(f) {
  return `${f.slice(6, 8)}/${f.slice(4, 6)}/${f.slice(0, 4)}`;
}

// Parchea (inmutablemente) la reconciliación persistida: quita las campañas recuperadas
// de pendientes del servidor coincidente en la entrada de esa fecha, y ajusta contadores.
function parchearReconciliacion(history, { fecha, host, user, recuperadas }) {
  const display = yyyymmddToDisplay(fecha);
  const camps = new Set(recuperadas.map(r => r.camp));
  const sumV = recuperadas.reduce((a, r) => a + (r.validos || 0), 0);
  const sumR = recuperadas.reduce((a, r) => a + (r.raw || 0), 0);
  let patched = false;

  const nuevo = history.map(entry => {
    if (patched || entry.fechaReporte !== display || !entry.reconciliacion) return entry;
    let cambiado = false;
    const servidores = entry.reconciliacion.servidores.map(s => {
      if (s.host !== host || s.user !== user) return s;
      const pendientes = s.pendientes.filter(p => !camps.has(p.camp));
      const recuperadasReal = s.pendientes.length - pendientes.length;
      if (recuperadasReal === 0) return s;
      cambiado = true;
      return {
        ...s,
        pendientes,
        conData: s.conData + recuperadasReal,
        registrosValidos: s.registrosValidos + sumV,
        registrosRaw: s.registrosRaw + sumR,
      };
    });
    if (!cambiado) return entry;
    patched = true;
    const totalPendientes = servidores.reduce((a, s) => a + s.pendientes.length, 0);
    return { ...entry, reconciliacion: { ...entry.reconciliacion, servidores, totalPendientes } };
  });

  return { history: nuevo, patched };
}

module.exports = { esDiaHabilLima, construirReconciliacion, calcularStatus, yyyymmddToDisplay, parchearReconciliacion };
```

- [ ] **Step 4: Correr y verificar que pasa**

Run: `node --test test/reconciliacion.test.js`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/clientes/contactoeficaz/ingesta/reconciliacion.js test/reconciliacion.test.js
git commit -m "feat(wolkvox): reconciliación por campaña + día hábil + parcheo

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: Integrar en `wolkvox.js` — modo normal

**Files:**
- Modify: `src/clientes/contactoeficaz/ingesta/wolkvox.js`

**Interfaces:**
- Consumes: `listarServidoresConCampanas` (Task 3), `intentarCampana`/`fetchCampanaConReintento` (Task 4),
  `construirReconciliacion`/`calcularStatus`/`esDiaHabilLima` (Task 5).
- Produces: `estado.reconciliacion` (§3.5 del spec) y `estado.status ∈ {ok, warning, error}` en `last_run_wolkvox.json`/history.

- [ ] **Step 1: Añadir imports**

En `src/clientes/contactoeficaz/ingesta/wolkvox.js`, junto a los `require` existentes:

```js
const { createPool, limpiarTmpGestiones,
        bulkRegistrarTmpGestiones,
        listarServidoresConCampanas,
        registrarGestiones,
        dedupGestionesVarios }       = require('../../../shared/ingesta/mcob');
const { intentarCampana, fetchCampanaConReintento, sleep } = require('../../../shared/ingesta/wolkvox-fetch');
const { construirReconciliacion, calcularStatus, esDiaHabilLima } = require('./reconciliacion');
```

(Se reemplaza `listarServidoresAsterisk` por `listarServidoresConCampanas` en el import.)

Añadir constantes de reintento tras `KEY_CRYPT`:

```js
const MAX_REINTENTOS = parseInt(process.env.WOLKVOX_MAX_REINTENTOS || '2', 10);
const BACKOFF_MS     = parseInt(process.env.WOLKVOX_BACKOFF_MS || '1500', 10);
```

- [ ] **Step 2: Reemplazar el bucle de servidores/campañas**

En `main()`, reemplazar el bloque `estado.fase = 'servidores'` + el `for (const srv ...)` (líneas ~162-189 del original) por:

```js
    estado.fase = 'servidores';
    const servidores = await listarServidoresConCampanas(pool);
    console.log(`[wolkvox] servidores encontrados: ${servidores.length}`);

    const registros = [];
    const reconServidores = []; // acumulador para reconciliación

    for (const srv of servidores) {
      // tipo=0 (override) → procesar todos; si no, solo los del turno actual
      if (tipo !== 0 && srv.timEje !== tipo) continue;
      estado.totalServidores++;
      console.log(`[wolkvox] servidor: ${srv.host} (${srv.user}) — ${srv.campanas.length} campañas`);

      const resultados = [];
      for (const camp of srv.campanas) {
        estado.totalCampanas++;
        const { data, resultado } = await fetchCampanaConReintento({
          intentar: () => intentarCampana({ host: srv.host, token: srv.token, camp, fecha }),
          maxReintentos: MAX_REINTENTOS, backoffMs: BACKOFF_MS, dormir: sleep,
        });
        estado.totalRegistros += data.length;
        let validos = 0;
        for (const item of data) { const reg = parsearLlamada(item); if (reg) { registros.push(reg); validos++; } }
        resultados.push({ camp, raw: data.length, validos, resultado });
        if (resultado !== 'ok') console.error(`  campaña ${camp}: ${resultado} (sin data tras reintentos)`);
      }
      reconServidores.push({ host: srv.host, user: srv.user, timEje: srv.timEje, resultados });
    }
```

- [ ] **Step 3: Construir la reconciliación antes de escribir el estado**

Tras el bloque de dedup en memoria / `estado.registrosValidos = ...` y ANTES del `if (registrosDedup.length > 0)`, añadir:

```js
    const diaHabil = esDiaHabilLima();
    estado.reconciliacion = construirReconciliacion(reconServidores, { diaHabil });
```

Y en la sección final (después de `estado.fase = 'completado'` en el `try`), fijar el status según pendientes (sin pisar un 'error'):

```js
    estado.fase = 'completado';
    if (estado.status === 'ok') {
      estado.status = calcularStatus(estado.reconciliacion.totalPendientes, diaHabil);
    }
    console.log(`[wolkvox] Procesamiento terminado — status=${estado.status}, pendientes=${estado.reconciliacion.totalPendientes}`);
```

> `estado.status` arranca en `'ok'` y pasa a `'error'` en el `catch`. El `warning` solo se aplica si no hubo excepción.

- [ ] **Step 4: Verificación sin escritura** (manual — requiere BD + API alcanzables)

Añadir al inicio de la fase de carga una guarda de prueba: reemplazar `if (registrosDedup.length > 0) {` por:

```js
    if (process.env.WOLKVOX_DRY_INGESTA === 'true') {
      console.log('[wolkvox] WOLKVOX_DRY_INGESTA=true — sin escritura; reconciliación:',
        JSON.stringify(estado.reconciliacion, null, 2));
    } else if (registrosDedup.length > 0) {
```

Run (con una fecha con data conocida): `WOLKVOX_DRY_INGESTA=true WOLKVOX_FECHA=20260703 node src/clientes/contactoeficaz/ingesta/wolkvox.js`
Expected: imprime `reconciliacion` con `servidores[]` y `pendientes` (0 si todo trajo data). No escribe en BD.

- [ ] **Step 5: Commit**

```bash
git add src/clientes/contactoeficaz/ingesta/wolkvox.js
git commit -m "feat(wolkvox): itera campañas reales con reintento y arma reconciliación

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: `wolkvox.js` — modo dirigido (re-run por servidor)

**Files:**
- Modify: `src/clientes/contactoeficaz/ingesta/wolkvox.js`

**Interfaces:**
- Consumes: env `WOLKVOX_ONLY_HOST`, `WOLKVOX_ONLY_USER`, `WOLKVOX_ONLY_CAMPS` (csv), `WOLKVOX_FECHA`.
  `parchearReconciliacion` (Task 5).
- Produces: al terminar, un resumen `{ status:'ok', modo:'dirigido', recuperadas, aunPendientes }` impreso como
  última línea JSON (para el endpoint) y `history_wolkvox.json`/`last_run` parcheados.

- [ ] **Step 1: Añadir import del parcheo y helpers de FS ya presentes**

En los `require` de `wolkvox.js` añadir a la desestructuración de `./reconciliacion`:

```js
const { construirReconciliacion, calcularStatus, esDiaHabilLima, parchearReconciliacion } = require('./reconciliacion');
```

- [ ] **Step 2: Ramificar a modo dirigido al inicio de `main()`**

Al comienzo de `main()`, tras crear `pool` y antes de `getTipoYFecha`, añadir:

```js
    const onlyHost  = process.env.WOLKVOX_ONLY_HOST;
    const onlyUser  = process.env.WOLKVOX_ONLY_USER;
    const onlyCamps = (process.env.WOLKVOX_ONLY_CAMPS || '').split(',').map(s => parseInt(s.trim(), 10)).filter(Boolean);
    if (onlyHost && onlyUser && onlyCamps.length && process.env.WOLKVOX_FECHA) {
      await ejecutarDirigido(pool, { host: onlyHost, user: onlyUser, camps: onlyCamps, fecha: process.env.WOLKVOX_FECHA });
      return;
    }
```

- [ ] **Step 3: Implementar `ejecutarDirigido`**

Añadir la función antes de `main()`:

```js
async function ejecutarDirigido(pool, { host, user, camps, fecha }) {
  const MAX = parseInt(process.env.WOLKVOX_MAX_REINTENTOS || '2', 10);
  const BACK = parseInt(process.env.WOLKVOX_BACKOFF_MS || '1500', 10);
  const resumen = { status: 'ok', modo: 'dirigido', host, user, fecha, recuperadas: [], aunPendientes: [] };

  // Obtener token del servidor desde el SP companion
  const servidores = await listarServidoresConCampanas(pool);
  const srv = servidores.find(s => s.host === host && s.user === user);
  const token = srv ? srv.token : null;
  if (!token) { resumen.status = 'error'; resumen.error = 'Servidor no encontrado en el SP'; process.stdout.write(`\n${JSON.stringify(resumen)}\n`); return; }

  const registros = [];
  for (const camp of camps) {
    const { data, resultado } = await fetchCampanaConReintento({
      intentar: () => intentarCampana({ host, token, camp, fecha }),
      maxReintentos: MAX, backoffMs: BACK, dormir: sleep,
    });
    let validos = 0;
    for (const item of data) { const reg = parsearLlamada(item); if (reg) { registros.push(reg); validos++; } }
    if (resultado === 'ok' && validos > 0) resumen.recuperadas.push({ camp, validos, raw: data.length });
    else resumen.aunPendientes.push({ camp, resultado });
  }

  // Dedup en memoria (misma clave que el modo normal)
  const seen = new Set();
  const dedup = registros.filter(r => {
    const k = `${r.idConfBi}|${r.idClieBi}|${r.idTelBi}|${r.fecGesVc}|${r.horGesVc}|${r.tipResSi}`;
    if (seen.has(k)) return false; seen.add(k); return true;
  });

  if (dedup.length > 0) {
    await limpiarTmpGestiones(pool);
    await bulkRegistrarTmpGestiones(pool, dedup);
    await registrarGestiones(pool);
  }

  // Parchear la reconciliación persistida
  const histFile = path.join(DOWNLOADS_DIR, 'history_wolkvox.json');
  try {
    if (fs.existsSync(histFile) && resumen.recuperadas.length) {
      const hist = JSON.parse(fs.readFileSync(histFile, 'utf8'));
      const { history: h2, patched } = parchearReconciliacion(hist, { fecha, host, user, recuperadas: resumen.recuperadas });
      if (patched) {
        fs.writeFileSync(histFile, JSON.stringify(h2, null, 2));
        const lastFile = path.join(DOWNLOADS_DIR, 'last_run_wolkvox.json');
        if (fs.existsSync(lastFile)) {
          const last = JSON.parse(fs.readFileSync(lastFile, 'utf8'));
          const display = `${fecha.slice(6,8)}/${fecha.slice(4,6)}/${fecha.slice(0,4)}`;
          if (last.fechaReporte === display) {
            const patchedLast = h2.find(e => e.fechaReporte === display);
            if (patchedLast) fs.writeFileSync(lastFile, JSON.stringify(patchedLast, null, 2));
          }
        }
      }
    }
  } catch (e) { console.error('[wolkvox] parcheo reconciliación falló:', e.message); }

  console.log(`[wolkvox] dirigido: recuperadas=${resumen.recuperadas.length}, aún pendientes=${resumen.aunPendientes.length}`);
  process.stdout.write(`\n${JSON.stringify(resumen)}\n`);
}
```

- [ ] **Step 4: Verificación manual** (requiere BD + API)

Run: `WOLKVOX_ONLY_HOST=wv0064 WOLKVOX_ONLY_USER="WOLKVOX - CE SANTANDER" WOLKVOX_ONLY_CAMPS=17819 WOLKVOX_FECHA=20260703 node src/clientes/contactoeficaz/ingesta/wolkvox.js`
Expected: última línea JSON con `modo:'dirigido'` y `recuperadas` con `camp:17819`. Verificar en BD que no se duplicó (conteo por `ID_CONF_BI` + clave natural = 1 por gestión).

> Precaución: correr solo contra una campaña que se sepa NO cargada, o revertir. En pruebas usar una fecha/campaña controlada.

- [ ] **Step 5: Commit**

```bash
git add src/clientes/contactoeficaz/ingesta/wolkvox.js
git commit -m "feat(wolkvox): modo dirigido re-ejecuta campañas pendientes + parchea reconciliación

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 8: Endpoint `rerun-server`

**Files:**
- Modify: `web/routes/dashboard.js`
- Test: `test/rerun-server-validacion.test.js`

**Interfaces:**
- Produces: `validarRerunServerBody(body) => null | string` (null = válido; string = mensaje de error).
- Ruta: `POST /api/clients/:clientId/automations/:automationId/rerun-server`.

- [ ] **Step 1: Escribir el test de validación**

`test/rerun-server-validacion.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert');
const { validarRerunServerBody } = require('../web/routes/dashboard');

test('body válido devuelve null', () => {
  assert.strictEqual(validarRerunServerBody({ host:'wv0064', user:'CE SANTANDER', fecha:'20260703', campaigns:[17819,17820] }), null);
});
test('rechaza fecha mal formada', () => {
  assert.match(validarRerunServerBody({ host:'h', user:'u', fecha:'2026-07-03', campaigns:[1] }), /fecha/);
});
test('rechaza campaigns vacío o no entero', () => {
  assert.match(validarRerunServerBody({ host:'h', user:'u', fecha:'20260703', campaigns:[] }), /campaigns/);
  assert.match(validarRerunServerBody({ host:'h', user:'u', fecha:'20260703', campaigns:['x'] }), /enteros/);
});
test('rechaza host/user faltantes', () => {
  assert.match(validarRerunServerBody({ user:'u', fecha:'20260703', campaigns:[1] }), /host/);
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `node --test test/rerun-server-validacion.test.js`
Expected: FAIL — `validarRerunServerBody is not a function`.

- [ ] **Step 3: Implementar validación + ruta**

En `web/routes/dashboard.js`, añadir la función (antes de `module.exports`):

```js
function validarRerunServerBody(body) {
  if (!body || typeof body !== 'object') return 'Body inválido';
  const { host, user, fecha, campaigns } = body;
  if (!host || typeof host !== 'string') return 'host requerido';
  if (!user || typeof user !== 'string') return 'user requerido';
  if (!/^\d{8}$/.test(String(fecha || ''))) return 'fecha debe ser yyyyMMdd';
  if (!Array.isArray(campaigns) || campaigns.length === 0) return 'campaigns requerido';
  if (!campaigns.every(c => Number.isInteger(c) && c > 0)) return 'campaigns deben ser enteros positivos';
  return null;
}
```

Añadir la ruta (junto al `rerun` existente):

```js
// POST /api/clients/:clientId/automations/:automationId/rerun-server
router.post('/api/clients/:clientId/automations/:automationId/rerun-server', requireAuth, (req, res) => {
  const automation = getAutomation(req, res);
  if (!automation) return;
  if (req.params.automationId !== 'wolkvox') {
    return res.status(400).json({ error: 'Solo disponible para wolkvox' });
  }
  if (!botStatus.isEnabled(req.params.automationId)) {
    return res.status(403).json({ error: 'Bot inactivo. Actívalo primero desde el dashboard.' });
  }
  const err = validarRerunServerBody(req.body);
  if (err) return res.status(400).json({ error: err });

  const { host, user, fecha, campaigns } = req.body;
  req.socket.setTimeout(10 * 60 * 1000);

  const proc = spawn('node', [automation.script], {
    env: {
      ...process.env,
      WOLKVOX_ONLY_HOST: host,
      WOLKVOX_ONLY_USER: user,
      WOLKVOX_ONLY_CAMPS: campaigns.join(','),
      WOLKVOX_FECHA: fecha,
    },
    cwd: ROOT,
  });

  let stdout = '', stderr = '';
  proc.stdout.on('data', d => { stdout += d.toString(); });
  proc.stderr.on('data', d => { stderr += d.toString(); });
  proc.on('close', code => {
    let summary = null;
    const lines = stdout.trim().split('\n');
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i].trim();
      if (line.startsWith('{') && line.endsWith('}')) { try { summary = JSON.parse(line); break; } catch {} }
    }
    res.json({ exitCode: code, summary, stderr: stderr.slice(-1000) });
  });
  proc.on('error', err => { if (!res.headersSent) res.status(500).json({ error: err.message }); });
});
```

Cambiar el export para exponer también la función (el router sigue siendo el default):

```js
module.exports = router;
module.exports.validarRerunServerBody = validarRerunServerBody;
```

- [ ] **Step 4: Correr y verificar que pasa**

Run: `node --test test/rerun-server-validacion.test.js`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add web/routes/dashboard.js test/rerun-server-validacion.test.js
git commit -m "feat(wolkvox): endpoint rerun-server (modo dirigido) + validación

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 9: Notificación con `warning` + bloque por servidor

**Files:**
- Modify: `src/shared/ingesta/notificar.js`
- Test: `test/notificar.test.js`

**Interfaces:**
- Consumes: `estado.status ∈ {ok, warning, error}`, `estado.reconciliacion`.
- Produces: `buildHtml(estado, displayName) => string`, `buildSubject(estado, displayName) => string` (exportadas para test).

- [ ] **Step 1: Escribir los tests**

`test/notificar.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert');
const { buildHtml, buildSubject } = require('../src/shared/ingesta/notificar');

const base = {
  status: 'warning', timestamp: '2026-07-06T13:00:00Z', fechaReporte: '03/07/2026',
  registrosValidos: 149080, totalRegistros: 172628, duracion: '1 min 48 s',
  reconciliacion: { totalPendientes: 2, diaHabil: true, servidores: [
    { host:'wv0064', user:'CE SANTANDER', turno:1, campanasTotal:18, conData:16, registrosValidos:149080,
      pendientes:[{camp:17819,resultado:'vacio'},{camp:17820,resultado:'error'}] },
  ] },
};

test('warning: asunto marca advertencia y con pendientes', () => {
  const s = buildSubject(base, 'Wolkvox');
  assert.match(s, /Advertencia|pendientes/i);
});

test('warning: html incluye la campaña pendiente', () => {
  const html = buildHtml(base, 'Wolkvox');
  assert.match(html, /17819/);
  assert.match(html, /CE SANTANDER/);
});

test('ok sin pendientes: asunto normal', () => {
  const s = buildSubject({ ...base, status: 'ok', reconciliacion: { totalPendientes: 0, servidores: [] } }, 'Wolkvox');
  assert.match(s, /completada/i);
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `node --test test/notificar.test.js`
Expected: FAIL — `buildSubject` no exportado / html sin pendientes.

- [ ] **Step 3: Implementar**

En `src/shared/ingesta/notificar.js`:

1. Reemplazar el cálculo de colores/título en `buildHtml` para 3 estados:

```js
function buildHtml(estado, displayName) {
  const st = estado.status || 'ok';
  const theme = st === 'ok'
    ? { color:'#15803d', bg:'#f0fdf4', dot:'#22c55e', titulo:'Ingesta completada correctamente' }
    : st === 'warning'
    ? { color:'#b45309', bg:'#fffbeb', dot:'#f59e0b', titulo:'Ingesta completada con pendientes' }
    : { color:'#b91c1c', bg:'#fff5f5', dot:'#ef4444', titulo:'Error en la ingesta' };
  const ok = st === 'ok';
  const color = theme.color, bgColor = theme.bg, dotColor = theme.dot, titulo = theme.titulo;
```

(Se conservan las variables `color/bgColor/dotColor/titulo` que el resto del HTML ya usa. Eliminar las viejas definiciones basadas en el booleano `ok`.)

2. Añadir el bloque de pendientes por servidor antes del `errorBlock`:

```js
  const rec = estado.reconciliacion;
  const pendientesBlock = rec && rec.totalPendientes > 0 ? `
    <div style="margin:0 24px 20px;padding:14px 16px;background:#fffbeb;
                border:1px solid #fde68a;border-radius:9px;">
      <div style="font-size:11px;font-weight:600;color:#b45309;text-transform:uppercase;
                  letter-spacing:.4px;margin-bottom:8px;">Campañas pendientes (${rec.totalPendientes})</div>
      ${rec.servidores.filter(s => s.pendientes && s.pendientes.length).map(s => `
        <div style="font-size:12px;color:#7c5510;margin-bottom:4px">
          <b>${s.host}</b> · ${s.user}: ${s.pendientes.map(p => `${p.camp} (${p.resultado})`).join(', ')}
        </div>`).join('')}
    </div>` : '';
```

Y en el `return`, insertar `${pendientesBlock}` justo antes de `${errorBlock}`.

3. Extraer el asunto a `buildSubject` y usarlo en `notificarEjecucion`:

```js
function buildSubject(estado, displayName) {
  const st = estado.status || 'ok';
  const fecha = estado.fechaReporte || new Date().toLocaleDateString('es-PE', { timeZone: 'America/Lima' });
  if (st === 'error')   return `✗ ${displayName} — Error en ingesta [${fecha}]`;
  if (st === 'warning') {
    const n = estado.reconciliacion ? estado.reconciliacion.totalPendientes : 0;
    return `⚠ ${displayName} — Advertencia: ${n} campañas pendientes [${fecha}]`;
  }
  return `✓ ${displayName} — Ingesta completada [${fecha}]`;
}
```

En `notificarEjecucion`, reemplazar el cálculo de `subject` por `const subject = buildSubject(estado, displayName);` (eliminar las líneas de `icon`/`subject` viejas).

4. Exportar las funciones para test:

```js
module.exports = { notificarEjecucion, buildHtml, buildSubject };
```

- [ ] **Step 4: Correr y verificar que pasa**

Run: `node --test test/notificar.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/shared/ingesta/notificar.js test/notificar.test.js
git commit -m "feat(wolkvox): notificación con estado warning y bloque de campañas pendientes

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 10: Panel — tabla por servidor + botón

**Files:**
- Modify: `web/views/dashboard.js`
- Test: `test/render-servidores.test.js`

**Interfaces:**
- Consumes: `lastRun.reconciliacion` (Task 6), endpoint `rerun-server` (Task 8).
- Produces: `renderServidoresTabla(reconciliacion, ctx) => string` (HTML), exportada junto a `renderDashboard`.
  `ctx = { clientId, autoId, fecha }` (fecha en `yyyyMMdd`).

- [ ] **Step 1: Escribir el test de render**

`test/render-servidores.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert');
const { renderServidoresTabla } = require('../web/views/dashboard');

const rec = { totalPendientes: 2, servidores: [
  { host:'wv0064', user:'CE SANTANDER', turno:1, campanasTotal:18, conData:16, registrosValidos:149080,
    pendientes:[{camp:17819,resultado:'vacio'},{camp:17820,resultado:'error'}] },
  { host:'wv0057', user:'WOLKVOX', turno:1, campanasTotal:4, conData:4, registrosValidos:1200, pendientes:[] },
]};

test('muestra fila por servidor y botón solo donde hay pendientes', () => {
  const html = renderServidoresTabla(rec, { clientId:'contactoeficaz', autoId:'wolkvox', fecha:'20260703' });
  assert.match(html, /wv0064/);
  assert.match(html, /CE SANTANDER/);
  assert.match(html, /Reintentar pendientes/);           // botón presente
  assert.match(html, /17819,17820/);                     // csv de pendientes en el botón
  const ocurrencias = (html.match(/Reintentar pendientes/g) || []).length;
  assert.strictEqual(ocurrencias, 1);                    // solo el servidor con pendientes
});

test('sin reconciliación devuelve string vacío', () => {
  assert.strictEqual(renderServidoresTabla(null, { clientId:'c', autoId:'wolkvox', fecha:'20260703' }), '');
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `node --test test/render-servidores.test.js`
Expected: FAIL — `renderServidoresTabla is not a function`.

- [ ] **Step 3: Implementar el render (server-side)**

En `web/views/dashboard.js`, añadir la función (usa el `esc` ya definido en el módulo):

```js
function renderServidoresTabla(reconciliacion, ctx) {
  if (!reconciliacion || !Array.isArray(reconciliacion.servidores) || !reconciliacion.servidores.length) return '';
  const filas = reconciliacion.servidores.map(s => {
    const tienePend = s.pendientes && s.pendientes.length;
    const csv = tienePend ? s.pendientes.map(p => p.camp).join(',') : '';
    const estadoCell = tienePend
      ? `<span style="color:#b45309;font-weight:600">⚠ ${s.pendientes.length} pendientes</span>`
      : `<span style="color:#15803d">OK</span>`;
    const boton = tienePend
      ? `<button type="button" class="btn-rerun-srv"
           onclick="rerunServer('${esc(ctx.clientId)}','${esc(ctx.autoId)}','${esc(s.host)}','${esc(String(s.user))}','${esc(ctx.fecha)}','${csv}',this)">
           Reintentar pendientes</button>`
      : '';
    return `<tr>
      <td>${esc(s.host)}</td>
      <td>${esc(String(s.user))}</td>
      <td>${esc(String(s.turno))}</td>
      <td>${esc(String(s.conData))}/${esc(String(s.campanasTotal))}</td>
      <td>${esc(String(s.registrosValidos))}</td>
      <td>${estadoCell} ${boton}</td>
    </tr>`;
  }).join('');
  return `<table class="srv-tabla">
    <thead><tr><th>Host</th><th>Cliente</th><th>Turno</th><th>Camp. c/data</th><th>Registros</th><th>Estado</th></tr></thead>
    <tbody>${filas}</tbody></table>`;
}
```

Actualizar el export al final del archivo:

```js
module.exports = { renderDashboard, renderServidoresTabla };
```

- [ ] **Step 4: Correr y verificar que pasa**

Run: `node --test test/render-servidores.test.js`
Expected: PASS (2 tests).

- [ ] **Step 5: Integrar la tabla y la función cliente en la vista**

En `renderCard`, para el bloque de `lastRun` (donde se muestran métricas), insertar la tabla cuando exista reconciliación. Localizar el render del `lastRun` y añadir tras las métricas:

```js
      ${lastRun && lastRun.reconciliacion ? renderServidoresTabla(lastRun.reconciliacion, {
        clientId: clientId, autoId: autoId,
        fecha: (lastRun.fechaReporte || '').split('/').reverse().join(''), // DD/MM/YYYY -> YYYYMMDD
      }) : ''}
```

En la sección `<script>` del cliente (junto a `resendFailed`/`runNow`), añadir:

```js
async function rerunServer(clientId, autoId, host, user, fecha, campsCsv, btn) {
  if (!confirm('¿Reintentar las campañas pendientes de ' + host + ' (' + user + ')?')) return;
  const campaigns = campsCsv.split(',').map(function(x){ return parseInt(x,10); }).filter(Boolean);
  btn.disabled = true; const txt = btn.textContent; btn.textContent = 'Reintentando…';
  try {
    const r = await fetch('/api/clients/'+clientId+'/automations/'+autoId+'/rerun-server', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ host: host, user: user, fecha: fecha, campaigns: campaigns }),
    });
    const j = await r.json();
    if (!r.ok) { alert('Error: ' + (j.error || r.status)); btn.disabled = false; btn.textContent = txt; return; }
    const rec = j.summary ? (j.summary.recuperadas || []).length : 0;
    alert('Recuperadas: ' + rec + ' campaña(s). Actualizando…');
    location.reload();
  } catch (e) { alert('Error: ' + e.message); btn.disabled = false; btn.textContent = txt; }
}
```

Añadir estilos mínimos en el `<style>` del documento:

```css
.srv-tabla{width:100%;border-collapse:collapse;margin-top:10px;font-size:12px}
.srv-tabla th,.srv-tabla td{padding:6px 8px;border-bottom:1px solid #f0f0f2;text-align:left}
.btn-rerun-srv{margin-left:8px;padding:3px 10px;font-size:11px;border:1px solid #f59e0b;
  background:#fffbeb;color:#b45309;border-radius:6px;cursor:pointer}
.btn-rerun-srv:disabled{opacity:.6;cursor:default}
```

- [ ] **Step 6: Verificación manual del panel**

Run: `npm run web` y abrir el dashboard con un `last_run_wolkvox.json` que tenga `reconciliacion.servidores` con pendientes (se puede generar con Task 6 o editar el JSON de prueba). Verificar: la tabla por servidor se muestra; el botón aparece solo en servidores con pendientes; al pulsarlo pide confirmación y llama al endpoint.

- [ ] **Step 7: Commit**

```bash
git add web/views/dashboard.js test/render-servidores.test.js
git commit -m "feat(wolkvox): tabla por servidor en el panel + botón reintentar pendientes

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 11: Suite completa + cierre

**Files:** —

- [ ] **Step 1: Correr toda la suite**

Run: `npm test`
Expected: todos los tests PASS (smoke, mcob-servidores, wolkvox-fetch, reconciliacion, rerun-server-validacion, notificar, render-servidores).

- [ ] **Step 2: Verificación end-to-end en día hábil** (manual, opcional pero recomendado)

Con BD + API alcanzables y una fecha con data conocida:
`WOLKVOX_DRY_INGESTA=true WOLKVOX_FECHA=<yyyyMMdd> node src/clientes/contactoeficaz/ingesta/wolkvox.js`
Verificar que `reconciliacion.servidores` refleja campañas con data y pendientes coherentes.

- [ ] **Step 3: Commit final si quedó algo pendiente** (si aplica)

```bash
git add -A && git commit -m "chore(wolkvox): cierre feature reintento + reconciliación

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review (cobertura del spec)

- §3.1 SP companion → Task 2. §3.2 `listarServidoresConCampanas` → Task 3. §3.3 fetch+reintento → Task 4; integración normal → Task 6. §3.4 modo dirigido + parcheo → Task 5 (parcheo) + Task 7 (wiring). §3.5 estructura `reconciliacion` → Task 5/6. §3.6 status/día hábil → Task 5/6. §3.7 notificación → Task 9. §3.8 endpoint → Task 8. §3.9 panel → Task 10. §7 pruebas → cada task + Task 11.
- Sin placeholders: cada paso trae código/commando reales.
- Consistencia de nombres verificada: `fetchCampanaConReintento`, `intentarCampana`, `construirReconciliacion`, `calcularStatus`, `parchearReconciliacion`, `listarServidoresConCampanas`, `validarRerunServerBody`, `renderServidoresTabla`, `buildHtml`/`buildSubject` — usados con la misma firma en definición y consumo.
