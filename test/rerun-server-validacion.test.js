const { test } = require('node:test');
const assert = require('node:assert');
const { validarRerunServerBody } = require('../web/routes/dashboard');

test('body válido devuelve null', () => {
  assert.strictEqual(validarRerunServerBody({ host:'wv0064', user:'CE SANTANDER', fecha:'20260703', campaigns:[17819,17820] }), null);
});
test('rechaza fecha mal formada', () => {
  assert.match(validarRerunServerBody({ host:'h', user:'u', fecha:'2026-07-03', campaigns:[1] }), /fecha/);
});
test('rechaza campaigns vacío o no entero', () => {
  assert.match(validarRerunServerBody({ host:'h', user:'u', fecha:'20260703', campaigns:[] }), /campaigns/);
  assert.match(validarRerunServerBody({ host:'h', user:'u', fecha:'20260703', campaigns:['x'] }), /enteros/);
});
test('rechaza host/user faltantes', () => {
  assert.match(validarRerunServerBody({ user:'u', fecha:'20260703', campaigns:[1] }), /host/);
});
