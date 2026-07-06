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
