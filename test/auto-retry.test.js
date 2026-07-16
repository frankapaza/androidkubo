const { test } = require('node:test');
const assert = require('node:assert');
const { extraerErrorPendientes, fechaReporteToYyyymmdd } = require('../src/clientes/contactoeficaz/ingesta/auto-retry');

test('extraerErrorPendientes: solo error (no vacío), agrupado por servidor', () => {
  const estado = { reconciliacion: { servidores: [
    { host:'wv0064', user:'CE FALABELLA', pendientes:[
      { camp:17840, resultado:'error' }, { camp:17841, resultado:'vacio' }, { camp:17842, resultado:'error' },
    ]},
    { host:'wv0059', user:'EXPERTO', pendientes:[ { camp:11541, resultado:'vacio' } ] }, // solo vacío -> se excluye
    { host:'wv0057', user:'WOLKVOX', pendientes:[] },
  ] } };
  const out = extraerErrorPendientes(estado);
  assert.strictEqual(out.length, 1);
  assert.strictEqual(out[0].host, 'wv0064');
  assert.deepStrictEqual(out[0].camps, [17840, 17842]);
});

test('extraerErrorPendientes: sin reconciliación devuelve []', () => {
  assert.deepStrictEqual(extraerErrorPendientes({}), []);
  assert.deepStrictEqual(extraerErrorPendientes({ reconciliacion: {} }), []);
});

test('fechaReporteToYyyymmdd', () => {
  assert.strictEqual(fechaReporteToYyyymmdd('15/07/2026'), '20260715');
  assert.strictEqual(fechaReporteToYyyymmdd('bad'), '');
});
