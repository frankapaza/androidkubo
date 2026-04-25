require('dotenv').config();
const path = require('path');

function required(name) {
  const v = process.env[name];
  if (!v || v.trim() === '') {
    throw new Error(`Falta variable de entorno: ${name}`);
  }
  return v;
}

function bool(name, def = false) {
  const v = process.env[name];
  if (v === undefined) return def;
  return ['1', 'true', 'yes', 'y'].includes(v.toLowerCase());
}

const downloadDir = path.resolve(process.env.DOWNLOAD_DIR || './descargas');

module.exports = {
  crm: {
    url: required('CRM_URL'),
    user: required('CRM_USER'),
    pass: required('CRM_PASS'),
    perfil: required('CRM_PERFIL'),
    proveedor: required('CRM_PROVEEDOR'),
  },
  mibanco: {
    url: required('MIBANCO_URL'),
    user: required('MIBANCO_USER'),
    pass: required('MIBANCO_PASS'),
    notas: process.env.MIBANCO_NOTAS || 'Gestiones Diarias CE',
  },
  surgir: {
    proveedor: process.env.SURGIR_PROVEEDOR || '1018',
    smtp: {
      host: process.env.SURGIR_SMTP_HOST || 'mail.contactoeficaz.com.pe',
      port: parseInt(process.env.SURGIR_SMTP_PORT || '465'),
      user: process.env.SURGIR_SMTP_USER || 'gestiones.surgir@contactoeficaz.com.pe',
      pass: required('SURGIR_SMTP_PASS'),
    },
    mailTo: process.env.SURGIR_MAIL_TO || 'frankapazac@gmail.com',
  },
  downloadDir,
  headless: bool('HEADLESS', true),
  dryRun: bool('DRY_RUN', false),
};
