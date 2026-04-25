const path = require('path');
const ROOT = path.resolve(__dirname, '../..');

module.exports = {
  contactoeficaz: {
    displayName: 'ContactoEficaz',
    color: '#2563eb',
    automations: {
      mibanco: {
        displayName: 'Mibanco — Reporte Banco',
        color: '#0066cc',
        script: path.join(ROOT, 'src/index.js'),
        lastRunFile: path.join(ROOT, 'descargas/last_run.json'),
        historyFile: path.join(ROOT, 'descargas/history_mibanco.json'),
        scheduleKey: 'MIBANCO_SCHEDULE_TIME',
        configSchema: [
          { key: 'MIBANCO_URL',            label: 'URL FileTransfer',               type: 'text',     secret: false },
          { key: 'MIBANCO_USER',           label: 'Usuario',                        type: 'text',     secret: false },
          { key: 'MIBANCO_PASS',           label: 'Contraseña',                     type: 'password', secret: true  },
          { key: 'MIBANCO_NOTAS',          label: 'Notas de carga',                 type: 'text',     secret: false },
          { key: 'MIBANCO_SCHEDULE_TIME',  label: 'Horario de ejecución (hora Perú)', type: 'time',   secret: false },
        ],
      },
      surgir: {
        displayName: 'Surgir — Reporte Banco',
        color: '#e85d00',
        script: path.join(ROOT, 'src/clientes/contactoeficaz/surgir/rpa/index.js'),
        lastRunFile: path.join(ROOT, 'descargas/last_run_surgir.json'),
        historyFile: path.join(ROOT, 'descargas/history_surgir.json'),
        scheduleKey: 'SURGIR_SCHEDULE_TIME',
        configSchema: [
          { key: 'SURGIR_SMTP_HOST',       label: 'Servidor SMTP',                    type: 'text',     secret: false },
          { key: 'SURGIR_SMTP_PORT',       label: 'Puerto SMTP',                      type: 'number',   secret: false },
          { key: 'SURGIR_SMTP_USER',       label: 'Usuario SMTP',                     type: 'email',    secret: false },
          { key: 'SURGIR_SMTP_PASS',       label: 'Contraseña SMTP',                  type: 'password', secret: true  },
          { key: 'SURGIR_MAIL_TO',         label: 'Destinatarios (separados por ,)',  type: 'text',     secret: false },
          { key: 'SURGIR_SCHEDULE_TIME',   label: 'Horario de ejecución (hora Perú)', type: 'time',     secret: false },
        ],
      },
    },
  },
};
