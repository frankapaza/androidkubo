const { test } = require('node:test');
const assert = require('node:assert');
const { proximaEjecucion, fechaProcesaWolkvox, slotKey } = require('../web/lib/scheduler');

test('proximaEjecucion: de noche con horario de madrugada → mañana a esa hora', () => {
  assert.deepStrictEqual(
    proximaEjecucion(['02:00'], { fecha: '2026-10-23', h: 19, m: 31 }),
    { fecha: '2026-10-24', hora: '02:00' });
});

test('proximaEjecucion: elige el horario más cercano entre varios', () => {
  assert.deepStrictEqual(
    proximaEjecucion(['02:00', '20:00'], { fecha: '2026-10-23', h: 19, m: 31 }),
    { fecha: '2026-10-23', hora: '20:00' });
});

test('proximaEjecucion: misma hora y minuto ya cuenta como pasada', () => {
  assert.deepStrictEqual(
    proximaEjecucion(['2:00'], { fecha: '2026-10-24', h: 2, m: 0 }),
    { fecha: '2026-10-25', hora: '02:00' });
});

test('proximaEjecucion: cruza fin de mes', () => {
  assert.deepStrictEqual(
    proximaEjecucion(['02:00'], { fecha: '2026-10-31', h: 23, m: 0 }),
    { fecha: '2026-11-01', hora: '02:00' });
});

test('proximaEjecucion: sin horarios válidos → null', () => {
  assert.strictEqual(proximaEjecucion(['', 'xx'], { fecha: '2026-10-23', h: 10, m: 0 }), null);
});

test('fechaProcesaWolkvox: antes de mediodía procesa el día anterior', () => {
  assert.strictEqual(fechaProcesaWolkvox({ fecha: '2026-10-24', hora: '02:00' }), '20261023');
});

test('fechaProcesaWolkvox: desde mediodía procesa el mismo día', () => {
  assert.strictEqual(fechaProcesaWolkvox({ fecha: '2026-10-23', hora: '20:00' }), '20261023');
});

test('slotKey: normaliza la hora a HH:MM', () => {
  assert.strictEqual(slotKey('2026-10-24', '2:00'), '2026-10-24 02:00');
});
