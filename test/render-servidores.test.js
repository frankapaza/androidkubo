const { test } = require('node:test');
const assert = require('node:assert');
const { renderServidoresTabla } = require('../web/views/dashboard');

const rec = { totalPendientes: 2, servidores: [
  { host:'wv0064', user:'CE SANTANDER', turno:1, campanasTotal:18, conData:16, registrosValidos:149080,
    pendientes:[{camp:17819,resultado:'vacio'},{camp:17820,resultado:'error'}],
    campanas:[{camp:17798,validos:90,raw:100,resultado:'ok',intentos:1}] },
  { host:'wv0057', user:'WOLKVOX', turno:1, campanasTotal:4, conData:4, registrosValidos:1200, pendientes:[],
    campanas:[{camp:29283,validos:1200,raw:1300,resultado:'ok',intentos:1}] },
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

test('cada servidor con campanas tiene botón ver-detalle con data-campanas', () => {
  const html = renderServidoresTabla(rec, { clientId:'contactoeficaz', autoId:'wolkvox', fecha:'20260703' });
  const botones = (html.match(/btn-ver-camp/g) || []).length;
  assert.strictEqual(botones, 2);                        // uno por servidor
  assert.match(html, /openCampanasSrv/);
  assert.match(html, /data-campanas=/);
  assert.match(html, /17798/);                           // detalle embebido en el data-*
});

test('sin reconciliación devuelve string vacío', () => {
  assert.strictEqual(renderServidoresTabla(null, { clientId:'c', autoId:'wolkvox', fecha:'20260703' }), '');
});
