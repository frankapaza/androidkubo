const { test } = require('node:test');
const assert = require('node:assert');
const { HOMOLOGACION } = require('../src/clientes/contactoeficaz/ingesta/wolkvox');

test('CONGESTION se homologa a NO CONTESTA (47)', () => {
  assert.deepStrictEqual(HOMOLOGACION['CONGESTION'], { tipResSi: 47, tipSolSi: 0 });
});

test('los no-contactos van a 47 y ANSWER-MACHINE a 46', () => {
  for (const r of ['NO-ANSWER', 'BUSY', 'ABANDON', 'CONGESTION']) {
    assert.strictEqual(HOMOLOGACION[r].tipResSi, 47, r);
  }
  assert.strictEqual(HOMOLOGACION['ANSWER-MACHINE'].tipResSi, 46);
});

test('ANSWER NO se homologa (regla de negocio: contacto efectivo no se registra)', () => {
  assert.strictEqual(HOMOLOGACION['ANSWER'], undefined);
});
