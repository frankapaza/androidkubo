require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

module.exports = {
  JWT_SECRET: process.env.WEB_JWT_SECRET || (() => {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('WEB_JWT_SECRET es obligatorio en producción');
    }
    console.warn('[web] ADVERTENCIA: WEB_JWT_SECRET no configurado, usando secreto temporal');
    return 'kubot-dev-secret-change-me-in-production';
  })(),
  PORT: parseInt(process.env.WEB_PORT || '3000'),
};
