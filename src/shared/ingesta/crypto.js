const crypto = require('crypto');

// Replica GCC.UTILITARIO.UTIL_Funciones.DecryptTripleDES:
// clave MD5 de 16 bytes → 2-key 3DES ECB (K1=K3), padding PKCS7.
// Si el resultado difiere, verificar si el original usa CBC con IV cero.
function decryptTripleDES(encryptedBase64, keyStr) {
  const key = crypto.createHash('md5').update(keyStr, 'utf8').digest(); // 16 bytes
  const decipher = crypto.createDecipheriv('des-ede', key, '');
  decipher.setAutoPadding(true);
  const buf = Buffer.from(encryptedBase64, 'base64');
  return Buffer.concat([decipher.update(buf), decipher.final()]).toString('utf8').trim();
}

module.exports = { decryptTripleDES };
