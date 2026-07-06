const { test } = require('node:test');
const assert = require('node:assert');
const { agruparServidoresCampanas } = require('../src/shared/ingesta/mcob');

test('agrupa filas (servidor+campaña) por servidor con campañas únicas y ordenadas', () => {
  const recordset = [
    { AMI_HOST_VC:'wv0064', AMI_USER_VC:'CE SANTANDER', AMI_PASS_VC:'tok1', TIM_EJE_SI:1, ID_CAMP_PROV_EXT_SI:17820 },
    { AMI_HOST_VC:'wv0064', AMI_USER_VC:'CE SANTANDER', AMI_PASS_VC:'tok1', TIM_EJE_SI:1, ID_CAMP_PROV_EXT_SI:17819 },
    { AMI_HOST_VC:'wv0064', AMI_USER_VC:'CE SANTANDER', AMI_PASS_VC:'tok1', TIM_EJE_SI:1, ID_CAMP_PROV_EXT_SI:17819 },
    { AMI_HOST_VC:'wv0057', AMI_USER_VC:'WOLKVOX', AMI_PASS_VC:'tok2', TIM_EJE_SI:2, ID_CAMP_PROV_EXT_SI:29283 },
  ];
  const out = agruparServidoresCampanas(recordset);
  assert.strictEqual(out.length, 2);
  const san = out.find(s => s.user === 'CE SANTANDER');
  assert.deepStrictEqual(san.campanas, [17819, 17820]);
  assert.strictEqual(san.host, 'wv0064');
  assert.strictEqual(san.token, 'tok1');
  assert.strictEqual(san.timEje, 1);
});
