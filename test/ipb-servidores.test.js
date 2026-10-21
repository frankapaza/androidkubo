const { test } = require('node:test');
const assert = require('node:assert');
const { hostDe, resumirServidores, parchearServidor } = require('../src/clientes/contactoeficaz/ingesta/ipb-servidores');

test('hostDe extrae el host de la URL (sin token del path)', () => {
  assert.strictEqual(hostDe('https://ce3.ipb.pe/gen_cdripb_json/abc.php'), 'ce3.ipb.pe');
  assert.strictEqual(hostDe('no-es-url'), 'no-es-url');
});

const srvs = [
  { host: 'ce3.ipb.pe', resultado: 'ok',    raw: 100, validos: 98 },
  { host: 'ce6.ipb.pe', resultado: 'error', raw: 0,   validos: 0, error: 'HTTP 403' },
  { host: 'ce7.ipb.pe', resultado: 'vacio', raw: 0,   validos: 0 },
];

test('resumirServidores suma totales y marca error si algún servidor falló', () => {
  const r = resumirServidores(srvs);
  assert.strictEqual(r.totalRegistros, 100);
  assert.strictEqual(r.registrosValidos, 98);
  assert.strictEqual(r.status, 'error');
  assert.match(r.error, /1 de 3/);
  assert.match(r.error, /ce6\.ipb\.pe/);
});

test('resumirServidores: vacío no es error', () => {
  const r = resumirServidores([srvs[0], srvs[2]]);
  assert.strictEqual(r.status, 'ok');
  assert.strictEqual(r.error, null);
});

test('parchearServidor reemplaza el servidor en la corrida de esa fecha y recalcula', () => {
  const hist = [
    { fechaReporte: '2026-10-16', status: 'error', servidores: srvs.map(s => ({ ...s })) },
    { fechaReporte: '2026-10-15', status: 'ok', servidores: [] },
  ];
  const nuevo = { host: 'ce6.ipb.pe', resultado: 'ok', raw: 50, validos: 50 };
  const { history, patched } = parchearServidor(hist, { fechaReporte: '2026-10-16', servidor: nuevo });
  assert.strictEqual(patched, true);
  const e = history[0];
  assert.strictEqual(e.status, 'ok');
  assert.strictEqual(e.registrosValidos, 148);
  assert.strictEqual(e.totalRegistros, 150);
  assert.strictEqual(e.tamaño, '148 registros válidos');
  assert.strictEqual(e.servidores.find(s => s.host === 'ce6.ipb.pe').reintentado, true);
});

test('parchearServidor no toca nada si no hay corrida para esa fecha', () => {
  const { patched } = parchearServidor([{ fechaReporte: '2026-10-15', servidores: [] }],
    { fechaReporte: '2026-10-16', servidor: { host: 'x' } });
  assert.strictEqual(patched, false);
});

const { rangoFechas } = require('../src/clientes/contactoeficaz/ingesta/ipb-servidores');

test('rangoFechas genera días inclusivos, cruzando fin de mes', () => {
  assert.deepStrictEqual(rangoFechas('2026-09-29', '2026-10-02', '2026-10-16').fechas,
    ['2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02']);
  assert.deepStrictEqual(rangoFechas('2026-10-16', '2026-10-16', '2026-10-16').fechas, ['2026-10-16']);
});

test('rangoFechas rechaza rangos inválidos, futuros o demasiado largos', () => {
  assert.match(rangoFechas('2026-10-10', '2026-10-09', '2026-10-16').error, /anterior/);
  assert.match(rangoFechas('2026-10-10', '2026-10-17', '2026-10-16').error, /futuras/);
  assert.match(rangoFechas('10/10/2026', '2026-10-11', '2026-10-16').error, /yyyy-MM-dd/);
  assert.match(rangoFechas('2026-01-01', '2026-10-16', '2026-10-16').error, /máximo/);
});

const { servidoresParaPanel } = require('../src/clientes/contactoeficaz/ingesta/ipb-servidores');

test('servidoresParaPanel lista todos los de IPB_URL en orden, con detalle si existe', () => {
  const url = 'https://ce1.ipb.pe/x.php,https://ce3.ipb.pe/x.php, https://ce10.ipb.pe/x.php';
  const filas = servidoresParaPanel([{ host: 'ce3.ipb.pe', resultado: 'ok', raw: 5, validos: 5 }], url);
  assert.deepStrictEqual(filas.map(f => [f.host, f.resultado]),
    [['ce1.ipb.pe', 'sin_detalle'], ['ce3.ipb.pe', 'ok'], ['ce10.ipb.pe', 'sin_detalle']]);
});

test('servidoresParaPanel: corrida antigua sin detalle y hosts retirados de IPB_URL', () => {
  assert.strictEqual(servidoresParaPanel(undefined, 'https://ce1.ipb.pe/x.php')[0].resultado, 'sin_detalle');
  const filas = servidoresParaPanel([{ host: 'ce2.ipb.pe', resultado: 'error' }], 'https://ce1.ipb.pe/x.php');
  assert.deepStrictEqual(filas.map(f => f.host), ['ce1.ipb.pe', 'ce2.ipb.pe']);
  assert.deepStrictEqual(servidoresParaPanel(undefined, ''), []);
});

test('parsearRespuesta: "No se encontraron datos" es vacío, no error', () => {
  const { parsearRespuesta } = require('../src/clientes/contactoeficaz/ingesta/ipb-servidores');
  assert.deepStrictEqual(parsearRespuesta('No se encontraron datos del 2026-10-18'), []);
  assert.deepStrictEqual(parsearRespuesta('  No se encontraron datos del 2026-10-18\n'), []);
});

test('parsearRespuesta: JSON arreglo se devuelve; otro texto lanza error legible', () => {
  const { parsearRespuesta } = require('../src/clientes/contactoeficaz/ingesta/ipb-servidores');
  assert.deepStrictEqual(parsearRespuesta('[{"CAMPANA":"1"}]'), [{ CAMPANA: '1' }]);
  assert.throws(() => parsearRespuesta('{"a":1}'), /no es un arreglo JSON/);
  assert.throws(() => parsearRespuesta('Error interno del servidor'), /respuesta no JSON: "Error interno/);
});

const { parchearServidores, validarHosts } = require('../src/clientes/contactoeficaz/ingesta/ipb-servidores');

test('parchearServidores reemplaza varios servidores y agrega los que faltaban', () => {
  const hist = [{ fechaReporte: '2026-10-16', status: 'error', servidores: srvs.map(s => ({ ...s })) }];
  const { history, patched } = parchearServidores(hist, { fechaReporte: '2026-10-16', servidores: [
    { host: 'ce6.ipb.pe', resultado: 'ok', raw: 50, validos: 50 },
    { host: 'ce9.ipb.pe', resultado: 'ok', raw: 10, validos: 9 },
  ] });
  assert.strictEqual(patched, true);
  const e = history[0];
  assert.deepStrictEqual(e.servidores.map(s => s.host), ['ce3.ipb.pe', 'ce6.ipb.pe', 'ce7.ipb.pe', 'ce9.ipb.pe']);
  assert.strictEqual(e.status, 'ok');
  assert.strictEqual(e.registrosValidos, 157);
  assert.strictEqual(hist[0].servidores[1].resultado, 'error'); // no muta la entrada
});

test('validarHosts: vacío o todos = null; rechaza hosts desconocidos', () => {
  const disp = ['ce1.ipb.pe', 'ce3.ipb.pe'];
  assert.strictEqual(validarHosts(undefined, disp).hosts, null);
  assert.strictEqual(validarHosts([], disp).hosts, null);
  assert.strictEqual(validarHosts(['ce3.ipb.pe', 'ce1.ipb.pe'], disp).hosts, null);
  assert.deepStrictEqual(validarHosts(['ce3.ipb.pe', 'ce3.ipb.pe'], disp).hosts, ['ce3.ipb.pe']);
  assert.match(validarHosts(['ce9.ipb.pe'], disp).error, /ce9/);
  assert.match(validarHosts('ce1.ipb.pe', disp).error, /lista/);
});
