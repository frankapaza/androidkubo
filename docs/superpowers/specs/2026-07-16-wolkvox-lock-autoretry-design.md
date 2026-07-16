# Diseño — Wolkvox: candado de ejecución (serialización) + reintento automático

**Fecha:** 2026-07-16 · **Componente:** Ingesta Wolkvox · **Estado:** Aprobado

## Problema
1. Todas las corridas de Wolkvox (programada, "Enviar ahora", cada "Reintentar pendientes") son procesos `node` separados que comparten `CARGA.TMP_GESTION` y cada uno hace `limpiarTmpGestiones` (la vacía). Si dos corren a la vez → se pisan (datos perdidos, errores). Además, corridas en paralelo aumentan la presión sobre la API.
2. Cuando la API cae unos minutos, los reintentos actuales (inmediatos, 1.5s) no alcanzan → muchas campañas quedan pendientes y hay que reintentarlas a mano.

## Decisiones (confirmadas)
- **Candado (mutex) que serializa TODA la corrida** (descarga + carga), no solo el TMP. Una sola corrida de Wolkvox a la vez.
- **Encolar**: si el candado está tomado, el proceso **espera** (poll) su turno y luego corre — no se rechaza.
- **TTL anti-bloqueo**: si un proceso muere con el candado tomado, tras ~20 min se considera vencido y otro puede tomarlo.
- **Reintento automático** tras corrida **programada** con pendientes de tipo **'error'**: reintenta solo esas campañas a los **10 min**, hasta **3 veces** (10/20/30 min). Los 'vacío' NO se reintentan solos.
- **Alcance del auto-reintento**: lo maneja el **scheduler** (corridas programadas). Las manuales no auto-reintentan (el usuario está presente + botón). El candado sí aplica a todas.

## Arquitectura

### `src/shared/ingesta/lock.js` (nuevo)
- `acquireLock({ lockPath, ttlMs, pollMs, maxWaitMs, mode, label, now, sleep }) => Promise<release>`: crea el lockfile atómicamente (`writeFileSync` flag `wx`). Si existe y no está vencido, espera `pollMs` y reintenta hasta `maxWaitMs` (luego lanza timeout). Si existe y está vencido, lo borra y toma. Devuelve `release()` ligado a un token propio.
- `releaseLock(lockPath, token)`: borra el lockfile solo si el token coincide (evita borrar el de otro tras un takeover).
- `esVencido(lock, ttlMs, ahora)`, `leerLock(lockPath)`: auxiliares puros/testeables.

### `src/clientes/contactoeficaz/ingesta/wolkvox.js`
- Refactor: el cuerpo actual de `main()` pasa a `ejecutar()` que **retorna** el exit code (en vez de `process.exit`).
- Nuevo `main()`: `acquireLock` (espera turno) → `try { code = await ejecutar() } finally { release() }` → `process.exit(code)`.
- Aplica tanto al modo normal como al dirigido (ambos pasan por `ejecutar`).
- Lockfile en `DOWNLOAD_DIR/wolkvox.lock`.
- Config: `WOLKVOX_LOCK_TTL_MS` (def 1200000), `WOLKVOX_LOCK_WAIT_MS` (def 900000), `WOLKVOX_LOCK_POLL_MS` (def 5000).

### `src/clientes/contactoeficaz/ingesta/auto-retry.js` (nuevo)
- `extraerErrorPendientes(estado) => [{ host, user, camps:number[] }]`: de `estado.reconciliacion.servidores`, toma los servidores con `pendientes` de `resultado==='error'` y junta sus `camp`.
- `fechaReporteToYyyymmdd('DD/MM/YYYY') => 'yyyyMMdd'`.

### `web/lib/scheduler.js`
- `runScript` captura stdout; al cerrar, si `autoId==='wolkvox'`, parsea el último JSON (estado). Si hay error-pendientes → `programarReintentos(fechaReporte, servidores, 1)`.
- `programarReintentos(fechaReporte, servidores, intento)`: `setTimeout(RETRY_INTERVAL_MS)` → por cada servidor, `spawnDirigido(host,user,camps,fecha)` (que respeta el candado); junta los que siguen en 'error' (de `resumen.aunPendientes`); si quedan y `intento < RETRY_MAX` → agenda el siguiente; si no, log.
- `spawnDirigido`: spawnea `wolkvox.js` con `WOLKVOX_ONLY_HOST/USER/CAMPS` + `WOLKVOX_FECHA`, resuelve con el resumen parseado.
- Config: `WOLKVOX_RETRY_INTERVAL_MS` (def 600000 = 10 min), `WOLKVOX_RETRY_MAX` (def 3).

## Bordes
- Race al tomar candado vencido: `wx` garantiza que solo uno crea; el otro reintenta.
- Si el web server reinicia durante la espera de reintento, se pierde el `setTimeout` (lo cubre la siguiente corrida/botón). Aceptable v1.
- La espera del manual "Reintentar pendientes" mientras corre otra: el proceso espera; si supera el timeout HTTP (10 min) la respuesta se pierde pero el trabajo igual se completa en background.

## Pruebas
- `lock.js`: crear cuando libre; timeout cuando ocupado-fresco (now/sleep inyectados); takeover de vencido; `releaseLock` solo borra el propio token; `esVencido`.
- `auto-retry.js`: `extraerErrorPendientes` (solo 'error', agrupa camps); `fechaReporteToYyyymmdd`.
- Refactor `wolkvox.js`: carga sin error; `ejecutar` retorna código.
- Scheduler: verificación por carga + razonamiento (timers/spawn).

## Añadido: detalle amigable del error por campaña
- `intentarCampana` devuelve además `detalle` estructurado y liviano:
  - conexión/red (fetch lanza, no timeout): `{ tipo:'conexion', msg }`
  - timeout (AbortError): `{ tipo:'timeout' }`
  - HTTP ≠ 200: `{ tipo:'http', status }`
  - la API rechaza (json.error): `{ tipo:'api', msg }`
  - 200 vacío: `{ tipo:'vacio' }`; ok: `null`
- `fetchCampanaConReintento` propaga el `detalle` del último intento.
- `wolkvox.js` guarda `detalle` en cada `resultados[]`; `construirReconciliacion` lo incluye en `campanas[]`.
- El modal 🔍 muestra un **texto amigable** por campaña (mapeo cliente desde `detalle`): p. ej. conexión → "No se pudo conectar con Wolkvox (caída temporal de la API o red)"; http → "La API respondió error HTTP {status}"; timeout → "Tiempo de espera agotado"; api → "Wolkvox rechazó la consulta: {msg}"; vacio → "Sin llamadas devueltas (posible sin gestiones ese día)".

## Fuera de alcance
- Auto-reintento de corridas manuales. Botón "Reintentar pendientes" desde el Historial. Persistencia de reintentos ante reinicio del server.
