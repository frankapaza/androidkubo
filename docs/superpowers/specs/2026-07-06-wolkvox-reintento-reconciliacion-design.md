# Diseño — Wolkvox: reintento + reconciliación por campaña y re-ejecución por servidor

**Fecha:** 2026-07-06
**Componente:** Ingesta Wolkvox (`kubot_automatizaciones`)
**Estado:** Aprobado (pendiente de plan de implementación)

## 1. Contexto y problema

La ingesta Wolkvox (`src/clientes/contactoeficaz/ingesta/wolkvox.js`) descarga llamadas por
campaña desde la API de Wolkvox y las carga en `BD_MCOB` (`CALL.TBL_GESTION_VARIOS`).

Los servidores/campañas se obtienen de `ASTERISK.SP_LISTAR_ASTERISK_SERVIDOR`, que devuelve
por servidor el **rango** `MIN/MAX(ID_CAMP_PROV_EXT_SI)` calculado desde
`CONFIGURACION.TBL_CONFIGURACION` con una **ventana de 3 días** sobre `FEC_CRE_DT`
(`FLG_EST_BO=1 AND FLG_ACT_BO=1 AND CONVERT(DATE,FEC_CRE_DT) > GETDATE()-3`). La ingesta
itera **cada entero** de MIN a MAX.

**Incidente que motiva el cambio (03/07/2026, Santander wv0064):** la corrida del
04/07 01:00 sí se ejecutó y procesó el viernes (149,080/172,628 registros), y el rango a esa
hora (17778–17830) sí cubría las campañas 17819/17820/17822. Sin embargo esas 3 campañas
devolvieron 0 de la API en esa corrida (fallo/lag puntual por campaña) mientras el resto trajo
data. **El código se traga los errores por campaña en silencio** (`wolkvox.js` captura el error
por campaña y continúa; `listarLlamadas` retorna `[]` ante `!res.ok`/`json.error`) y la corrida
reporta `OK`. El hueco fue invisible hasta que el cliente lo reportó, y se recuperó manualmente
(17,968 registros, 0 duplicados).

**Objetivo:** detectar y recuperar estos huecos. Que una campaña real que queda en 0/error sea
visible, se reintente automáticamente dentro de la corrida, y pueda re-ejecutarse manualmente
por servidor desde el panel.

## 2. Decisiones (tomadas en brainstorming)

1. **Reconciliación por campaña + resumen por servidor.** Una alerta "servidor = 0" no habría
   detectado el incidente (el servidor Santander sí tuvo data en otras campañas). Se reconcilia
   a nivel de campaña real y se presenta agrupado por servidor.
2. **Reintento ante error Y vacío, con tope y backoff.** Si tras N reintentos sigue en 0, se
   marca como advertencia (no como error duro).
3. **El botón re-ejecuta solo las campañas pendientes** (0/error) de ese servidor — no las que ya
   cargaron bien. Sin riesgo de duplicados, sin dedup global. Requiere persistir por servidor la
   lista de campañas y su resultado.
4. **Escalar a `warning` + notificar solo en días hábiles (L-V, hora Lima).** En fin de semana se
   registra el detalle pero no se alerta (campañas activas sin llamadas dan 0 legítimo).
5. **La lista real de campañas activas por servidor se obtiene de un nuevo SP companion** en BD
   (no replicando la lógica de la ventana en Node).
6. **Alcance:** solo Wolkvox (no ipbusiness). Re-ejecución siempre a solicitud del usuario (manual),
   nunca automática. No se modifica el endpoint `rerun` completo existente.

## 3. Arquitectura

### 3.1. BD — nuevo SP companion

`ASTERISK.SP_LISTAR_ASTERISK_SERVIDOR_CAMPANA`

- Devuelve **una fila por (servidor + campaña)**:
  `AMI_HOST_VC, AMI_USER_VC, AMI_PASS_VC, TIM_EJE_SI, ID_CAMP_PROV_EXT_SI`.
- Usa **los mismos joins, filtros y ventana de 3 días** que `SP_LISTAR_ASTERISK_SERVIDOR`,
  pero **sin** `GROUP BY` / `MIN/MAX` — expone cada `ID_CAMP_PROV_EXT_SI`.
- El SP actual `SP_LISTAR_ASTERISK_SERVIDOR` **queda intacto** (lo consumen otros flujos).
- Despliegue vía `sql_scripts/` (skill `sql-script`), idempotente (`CREATE OR ALTER`).

### 3.2. Ingesta — `src/shared/ingesta/mcob.js`

- Nuevo helper `listarServidoresConCampanas(pool)`:
  - Ejecuta el SP nuevo.
  - Agrupa por servidor (clave `AMI_HOST_VC | AMI_USER_VC | AMI_PASS_VC | TIM_EJE_SI`) y devuelve
    `[{ host, user, token, timEje, campanas: [ids...] }]` (campañas ordenadas y únicas).
- Se conserva `listarServidoresAsterisk` (por compatibilidad / otros usos).

### 3.3. Ingesta — `src/clientes/contactoeficaz/ingesta/wolkvox.js`

**Flujo diario (modo normal):**

1. Determinar `tipo`/`fecha` (sin cambios).
2. `limpiarTmpGestiones`.
3. `listarServidoresConCampanas`.
4. Por cada servidor **en turno** (`timEje === tipo`, o todos si override `tipo=0`):
   - Por cada campaña real del servidor: `fetchCampanaConReintento(host, token, camp, fecha)`.
   - Acumular registros parseados (parseo/homologación/horario sin cambios).
   - Registrar resultado por campaña: `{ camp, raw, validos, resultado: 'ok'|'vacio'|'error' }`.
5. Dedup en memoria → `bulkRegistrarTmpGestiones` → `registrarGestiones` → dedup_sql (tipo 1).
   (Sin cambios respecto a hoy.)
6. Construir `estado.reconciliacion` (§3.5) y definir `estado.status` (§3.6).
7. Persistir `last_run` + history + notificar (§3.7).

**`fetchCampanaConReintento(host, token, camp, fecha)`** (nueva función):

- Llama a `listarLlamadas`. Clasifica:
  - **error**: excepción de red, `!res.ok`, o `json.error`.
  - **vacio**: HTTP 200 con `data` vacío.
  - **ok**: HTTP 200 con `data.length > 0`.
- Reintenta si el resultado es `error` **o** `vacio`, hasta `WOLKVOX_MAX_REINTENTOS` veces
  (default **2** reintentos → 3 intentos totales), con backoff `WOLKVOX_BACKOFF_MS` (default
  **1500 ms**, lineal: intento k espera k×backoff).
- Retorna `{ data, resultado, intentos }`. `resultado` final es `ok` si algún intento trajo data;
  si no, `vacio` (si el último fue 200 vacío) o `error` (si el último fue error).

> Nota: los reintentos se limitan a campañas **reales** (ya no se itera sobre huecos MIN..MAX),
> por lo que el costo extra de reintentar vacíos está acotado.

### 3.4. Modo dirigido (para el botón "Reintentar pendientes")

El mismo `wolkvox.js`, si detecta las env `WOLKVOX_ONLY_HOST`, `WOLKVOX_ONLY_USER`,
`WOLKVOX_ONLY_CAMPS` (lista separada por comas) y `WOLKVOX_FECHA`:

- Procesa **solo ese servidor y solo esas campañas** para `WOLKVOX_FECHA`.
- `limpiarTmpGestiones` → fetch (con reintento) de esas campañas → dedup memoria → bulk →
  `registrarGestiones`. **Sin dedup global** (dirigido; las campañas estaban en 0/error).
- **Parchea la reconciliación** de la corrida referenciada (busca en `history_wolkvox.json` la
  entrada por `fecha` + servidor y mueve las campañas recuperadas de `pendientes` → con data,
  actualizando contadores). Si esa entrada es también el `last_run`, actualiza ambos.
- Escribe un resumen propio del re-run dirigido para la respuesta del endpoint, pero **no** crea
  una nueva entrada de history diaria ni sobrescribe la corrida diaria como si fuera una corrida
  completa.

**Idempotencia / doble click:** tras un re-run exitoso las campañas dejan de estar en
`pendientes` (parcheo), por lo que el botón ya no las re-ejecuta. Además el botón se deshabilita
mientras corre y el panel refresca el estado al terminar. (Endurecimiento opcional futuro: dedup
scoped por campaña/fecha; fuera de alcance de v1.)

### 3.5. Estructura de `estado.reconciliacion`

```
reconciliacion: {
  servidores: [
    {
      host: 'wv0064',
      user: 'WOLKVOX - CE SANTANDER',
      turno: 1,                      // TIM_EJE_SI
      campanasTotal: 18,
      conData: 15,
      registrosRaw: 172628,
      registrosValidos: 149080,
      pendientes: [                  // solo campañas en 0/error tras reintentos
        { camp: 17819, resultado: 'vacio' },
        { camp: 17820, resultado: 'error' }
      ]
    }
  ],
  totalPendientes: 3,
  diaHabil: true
}
```

Se guarda en `last_run_wolkvox.json` y en cada entrada de `history_wolkvox.json`.

### 3.6. Estado de la corrida

- `estado.status = 'warning'` si `totalPendientes > 0` **y** `diaHabil === true`.
- En fin de semana con pendientes: `status = 'ok'`, pero `reconciliacion` igual lista los
  pendientes (visibles en panel, sin alerta).
- `diaHabil`: lunes–viernes según día de la semana en `America/Lima`.
- Sin pendientes: `status = 'ok'` como hoy.

### 3.7. Notificación

`src/shared/ingesta/notificar.js` (o el consumo desde `wolkvox.js`):

- El correo incluye el **resumen por servidor** (host, user, campañas con data/total, registros)
  y la lista de **pendientes** cuando existan.
- Asunto/severidad reflejan `warning` solo cuando `estado.status === 'warning'` (día hábil).
- En fin de semana / sin pendientes, correo normal como hoy.

### 3.8. Endpoint — `web/routes/dashboard.js`

`POST /api/clients/:clientId/automations/:automationId/rerun-server`

- Body: `{ host, user, fecha, campaigns: number[] }`.
- Validaciones: `automationId === 'wolkvox'`; bot activo (`botStatus.isEnabled`); `host`/`user`
  no vacíos; `fecha` con formato `yyyyMMdd`; `campaigns` array no vacío de enteros.
- `spawn('node', [wolkvox.script])` con env `WOLKVOX_ONLY_HOST/USER/CAMPS` + `WOLKVOX_FECHA`
  (reutiliza el patrón de parseo de summary del `rerun` existente).
- Respuesta: `{ exitCode, summary }` con el resumen del re-run dirigido (recuperados / aún
  pendientes).
- Reutiliza `requireAuth` y el timeout extendido del socket como el `rerun` actual.

### 3.9. Panel — `web/views/dashboard.js`

- En la tarjeta de Wolkvox, **tabla por servidor** desde `lastRun.reconciliacion.servidores`:
  columnas `AMI_HOST | AMI_USER | turno | campañas (conData/total) | registros | estado`.
- Servidores con `pendientes.length > 0`: badge ⚠ con el conteo y botón
  **"Reintentar pendientes"**.
- Click → confirmación → `POST rerun-server` con `{ host, user, fecha: <fechaReporte de la
  corrida en yyyyMMdd>, campaigns: pendientes }`.
- Botón deshabilitado mientras corre; al terminar, refresca `lastRun` (las recuperadas
  desaparecen de pendientes).

## 4. Componentes y responsabilidades

| Unidad | Responsabilidad | Depende de |
|---|---|---|
| `SP_LISTAR_ASTERISK_SERVIDOR_CAMPANA` (BD) | Lista (servidor+campaña) reales por ventana | `TBL_CONFIGURACION`, `TBL_ASTERISK_SERVIDOR` |
| `listarServidoresConCampanas` (mcob.js) | Ejecuta el SP y agrupa por servidor | SP nuevo |
| `fetchCampanaConReintento` (wolkvox.js) | Fetch con reintento + clasificación ok/vacío/error | `listarLlamadas` |
| Constructor de `reconciliacion` (wolkvox.js) | Arma servidores[]/pendientes/status | resultados por campaña |
| Modo dirigido (wolkvox.js) | Re-ejecuta campañas pendientes de un servidor + parcheo | env `WOLKVOX_ONLY_*` |
| `POST rerun-server` (dashboard.js) | Dispara el modo dirigido bajo auth | wolkvox.js, botStatus |
| Tabla por servidor + botón (views/dashboard.js) | Visibilidad + acción manual | `reconciliacion` |

## 5. Manejo de errores y bordes

- Campaña con error persistente tras reintentos → `resultado: 'error'`, entra en `pendientes`.
- Campaña 200-vacío tras reintentos → `resultado: 'vacio'`, entra en `pendientes`.
- Servidor fuera de turno → no se procesa (no genera pendientes).
- Override `WOLKVOX_FECHA` (tipo 0) → procesa todos los servidores; reconciliación igual.
- Modo dirigido con campañas que ya no están en la ventana → funciona igual: se consultan los
  `campaign_id` explícitos recibidos (no dependen del SP/ventana).
- Fin de semana con pendientes → registra sin escalar (`status ok`).
- Doble click en el botón → mitigado por parcheo + deshabilitado + refresh (§3.4).

## 6. Configuración (`.env`)

| Variable | Default | Uso |
|---|---|---|
| `WOLKVOX_MAX_REINTENTOS` | `2` | Reintentos por campaña (además del intento inicial) |
| `WOLKVOX_BACKOFF_MS` | `1500` | Backoff base (lineal por intento) |
| `WOLKVOX_DRY_INGESTA` | (no set) | Opt-in de prueba sin escritura (no usar `DRY_RUN`, fijado en false en `.env`) |

Env de modo dirigido (las setea el endpoint, no van en `.env`): `WOLKVOX_ONLY_HOST`,
`WOLKVOX_ONLY_USER`, `WOLKVOX_ONLY_CAMPS`, `WOLKVOX_FECHA`.

## 7. Pruebas

- **Unit** (`fetchCampanaConReintento`): con `fetch` mockeado — error→reintenta→ok; vacío
  persistente→`vacio`; error persistente→`error`; respeta tope de reintentos.
- **Unit** (reconciliación): dado un set de resultados por campaña, arma `servidores[]`,
  `pendientes`, `totalPendientes`, `status`/`diaHabil` correctos (incluye caso fin de semana).
- **SP**: query de validación comparando el conjunto de campañas del SP nuevo con el MIN/MAX del
  SP actual para el mismo instante (consistencia de ventana/joins).
- **Modo prueba sin escritura** (`WOLKVOX_DRY_INGESTA`): fetch + reconciliar + imprimir sin
  escribir en BD, contra un servidor real.
- **Modo dirigido**: re-run de campañas conocidas de un servidor; verificar carga + parcheo de
  reconciliación + ausencia de duplicados (conteo por `ID_CONF_BI` + clave natural).
- **Panel**: render con un `estado` de ejemplo con pendientes; el click dispara el endpoint y el
  refresh actualiza la tabla.

## 8. Fuera de alcance

- ipbusiness u otras ingestas.
- Re-ejecución automática (siempre manual).
- Dedup scoped por campaña (endurecimiento futuro de idempotencia).
- Reconciliación histórica retroactiva de corridas anteriores a este cambio.
