const { test } = require('node:test');
const assert = require('node:assert');
const { buildHtml, buildSubject } = require('../src/shared/ingesta/notificar');

const base = {
  status: 'warning', timestamp: '2026-07-06T13:00:00Z', fechaReporte: '03/07/2026',
  registrosValidos: 149080, totalRegistros: 172628, duracion: '1 min 48 s',
  reconciliacion: { totalPendientes: 2, diaHabil: true, servidores: [
    { host:'wv0064', user:'CE SANTANDER', turno:1, campanasTotal:18, conData:16, registrosValidos:149080,
      pendientes:[{camp:17819,resultado:'vacio'},{camp:17820,resultado:'error'}] },
  ] },
};

test('warning: asunto marca advertencia y con pendientes', () => {
  const s = buildSubject(base, 'Wolkvox');
  assert.match(s, /Advertencia|pendientes/i);
});

test('warning: html incluye la campaña pendiente', () => {
  const html = buildHtml(base, 'Wolkvox');
  assert.match(html, /17819/);
  assert.match(html, /CE SANTANDER/);
});

test('ok sin pendientes: asunto normal', () => {
  const s = buildSubject({ ...base, status: 'ok', reconciliacion: { totalPendientes: 0, servidores: [] } }, 'Wolkvox');
  assert.match(s, /completada/i);
});
