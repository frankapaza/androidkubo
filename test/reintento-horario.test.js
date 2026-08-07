const { test } = require('node:test');
const assert = require('node:assert');
const { msHastaHora } = require('../web/lib/scheduler');

test('msHastaHora: desde 01:35:00 hasta las 2:00 = 25 min', () => {
  assert.strictEqual(msHastaHora(1, 35, 0, 2), 25 * 60 * 1000);
});

test('msHastaHora: desde 02:05:00 hasta las 3:00 = 55 min', () => {
  assert.strictEqual(msHastaHora(2, 5, 0, 3), 55 * 60 * 1000);
});

test('msHastaHora: si la hora ya pasó hoy, cuenta hasta mañana', () => {
  // 04:00:00 -> próxima 2:00 = 22 h
  assert.strictEqual(msHastaHora(4, 0, 0, 2), 22 * 3600 * 1000);
});

test('msHastaHora: exactamente en la hora objetivo cuenta el ciclo completo (mañana)', () => {
  assert.strictEqual(msHastaHora(2, 0, 0, 2), 24 * 3600 * 1000);
});
