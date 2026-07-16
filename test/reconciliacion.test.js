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
      { camp: 17798, raw: 100, validos: 90, resultado: 'ok', intentos: 1 },
      { camp: 17819, raw: 0, validos: 0, resultado: 'vacio', intentos: 3, detalle: { tipo: 'vacio' } },
      { camp: 17820, raw: 0, validos: 0, resultado: 'error', intentos: 3, detalle: { tipo: 'conexion', msg: 'fetch failed' } },
    ],
  }];
  const rec = construirReconciliacion(servidores, { diaHabil: true });
  assert.strictEqual(rec.totalPendientes, 2);
  const s = rec.servidores[0];
  assert.strictEqual(s.campanasTotal, 3);
  assert.strictEqual(s.conData, 1);
  assert.strictEqual(s.registrosValidos, 90);
  assert.deepStrictEqual(s.pendientes, [{ camp: 17819, resultado: 'vacio' }, { camp: 17820, resultado: 'error' }]);
  // detalle completo por campaña (incluye detalle del error)
  assert.deepStrictEqual(s.campanas, [
    { camp: 17798, validos: 90, raw: 100, resultado: 'ok', intentos: 1, detalle: null },
    { camp: 17819, validos: 0, raw: 0, resultado: 'vacio', intentos: 3, detalle: { tipo: 'vacio' } },
    { camp: 17820, validos: 0, raw: 0, resultado: 'error', intentos: 3, detalle: { tipo: 'conexion', msg: 'fetch failed' } },
  ]);
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
        campanas: [
          { camp: 17798, validos: 90, raw: 100, resultado: 'ok', intentos: 1 },
          { camp: 17819, validos: 0, raw: 0, resultado: 'vacio', intentos: 3 },
          { camp: 17820, validos: 0, raw: 0, resultado: 'error', intentos: 3 },
        ],
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
  // la campaña recuperada queda como ok en el detalle
  const c = s.campanas.find(x => x.camp === 17819);
  assert.strictEqual(c.resultado, 'ok');
  assert.strictEqual(c.validos, 50);
  assert.strictEqual(c.raw, 60);
});

test('parchearReconciliacion no toca entradas de otra fecha', () => {
  const history = [{ fechaReporte: '01/07/2026', reconciliacion: { totalPendientes: 1, servidores: [{ host:'wv0064', user:'CE SANTANDER', pendientes:[{camp:17819,resultado:'error'}], conData:0, registrosRaw:0, registrosValidos:0 }] } }];
  const { patched } = parchearReconciliacion(history, { fecha: '20260703', host:'wv0064', user:'CE SANTANDER', recuperadas:[{camp:17819,validos:1,raw:1}] });
  assert.strictEqual(patched, false);
});
