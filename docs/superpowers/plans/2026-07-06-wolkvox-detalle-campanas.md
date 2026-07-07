# Wolkvox: detalle por campaña en modal — Implementation Plan

**Goal:** Poder ver el desglose por campaña (válidos/crudas/estado/intentos) de una corrida, en un modal reutilizable abierto desde la tabla por servidor (corrida actual) y desde el Historial.

**Architecture:** Se persiste la lista completa de campañas por servidor en `estado.reconciliacion`. El panel gana un modal (vanilla JS) que se rellena desde un `data-*` del botón (tabla actual) o desde `_histCache` (historial).

**Tech Stack:** Node.js, `node --test`, HTML/JS server-rendered.

## Global Constraints
- Sin dependencias nuevas. Solo Wolkvox. Auto-deploy vía merge a `main`.
- Retrocompatible: corridas viejas sin `campanas` → modal muestra "sin detalle".
- Commits terminan en `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

---

## Task 1: Persistir detalle por campaña

**Files:**
- Modify: `src/clientes/contactoeficaz/ingesta/reconciliacion.js` (`construirReconciliacion`, `parchearReconciliacion`)
- Modify: `src/clientes/contactoeficaz/ingesta/wolkvox.js` (capturar `intentos`)
- Test: `test/reconciliacion.test.js`

**Interfaces:**
- `construirReconciliacion` agrega a cada servidor `campanas: [{camp, validos, raw, resultado, intentos}]`.
- `parchearReconciliacion` además marca en `campanas` las recuperadas como `ok`.

- [ ] Step 1: Test — `campanas` presente + parcheo actualiza `campanas`.
- [ ] Step 2: Correr → falla.
- [ ] Step 3: Implementar (map de resultados → campanas; wolkvox.js pasa `intentos`; parcheo actualiza campanas).
- [ ] Step 4: Correr → pasa.
- [ ] Step 5: Commit.

## Task 2: Modal + entradas (panel)

**Files:**
- Modify: `web/views/dashboard.js` (`renderServidoresTabla` botón 🔍; modal markup; client JS `openCampanasSrv`/`openCampanasHist`/builder; icono en `renderHistTable`; estilos)
- Test: `test/render-servidores.test.js` (botón 🔍 con `data-campanas`)

- [ ] Step 1: Test — `renderServidoresTabla` incluye botón con `data-campanas` por servidor.
- [ ] Step 2: Correr → falla.
- [ ] Step 3: Implementar botón + modal + client JS + icono historial + estilos.
- [ ] Step 4: Correr → pasa. Verificación manual del modal (`npm run web`).
- [ ] Step 5: Commit.

## Task 3: Suite + cierre
- [ ] `npm test` completo verde. Commit si aplica.
