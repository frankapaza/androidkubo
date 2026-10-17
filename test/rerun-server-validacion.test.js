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

const { validarRerunIpbBody } = require('../web/routes/dashboard');

test('IPB: body válido y rechazos', () => {
  assert.strictEqual(validarRerunIpbBody({ host:'ce3.ipb.pe', fecha:'2026-10-16' }), null);
  assert.match(validarRerunIpbBody({ host:'ce3.ipb.pe', fecha:'20261016' }), /fecha/);
  assert.match(validarRerunIpbBody({ host:"x'); alert(1);//", fecha:'2026-10-16' }), /host/);
});
