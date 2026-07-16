const { test } = require('node:test');
const assert = require('node:assert');
const { normalizarTelefono } = require('../src/clientes/contactoeficaz/ingesta/wolkvox');

test('celular de 11 dígitos: quita el prefijo del frente y deja 9', () => {
  assert.strictEqual(normalizarTelefono('92900055484'), '900055484');
});

test('exactamente 9 dígitos: no se toca', () => {
  assert.strictEqual(normalizarTelefono('900055484'), '900055484');
});

test('menos de 9 dígitos (fijo): no se toca', () => {
  assert.strictEqual(normalizarTelefono('4251234'), '4251234');
});

test('10 dígitos: se queda con los últimos 9', () => {
  assert.strictEqual(normalizarTelefono('1900055484'), '900055484');
});

test('limpia no-dígitos y normaliza', () => {
  assert.strictEqual(normalizarTelefono('92-900 055 484'), '900055484');
});

test('vacío/nulo → cadena vacía', () => {
  assert.strictEqual(normalizarTelefono(''), '');
  assert.strictEqual(normalizarTelefono(null), '');
  assert.strictEqual(normalizarTelefono(undefined), '');
});
