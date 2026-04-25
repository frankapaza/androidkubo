const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');
const config = require('../../../../shared/config');
const { fechaHoyDDMMYYYY, log } = require('../../../../shared/util');

async function enviarReporte(archivoPath) {
  if (!archivoPath) throw new Error('Falta ruta del archivo a enviar');
  if (!fs.existsSync(archivoPath)) throw new Error(`No existe el archivo: ${archivoPath}`);

  const { host, port, user, pass } = config.surgir.smtp;
  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });

  const fecha = fechaHoyDDMMYYYY();
  const nombreArchivo = path.basename(archivoPath);
  const bytes = fs.statSync(archivoPath).size;

  log(`Enviando correo a: ${config.surgir.mailTo}`);
  log(`Adjunto: ${nombreArchivo} (${bytes} bytes)`);

  const info = await transporter.sendMail({
    from: `"Gestiones Surgir" <${user}>`,
    to: config.surgir.mailTo,
    subject: `Reporte Banco Surgir ${fecha}`,
    text: `Estimados,\n\nSe adjunta el reporte de banco Surgir correspondiente al ${fecha}.\n\nSaludos,\nKubot Automatizaciones`,
    attachments: [
      {
        filename: nombreArchivo,
        path: archivoPath,
      },
    ],
  });

  log(`Correo enviado. MessageId: ${info.messageId}`);
  return { messageId: info.messageId, to: config.surgir.mailTo, archivo: nombreArchivo };
}

if (require.main === module) {
  const arg = process.argv[2];
  if (!arg) {
    console.error('Uso: node src/clientes/contactoeficaz/surgir/rpa/enviarCorreo.js <ruta_al_archivo>');
    process.exit(2);
  }
  enviarReporte(arg)
    .then((r) => {
      process.stdout.write(`${JSON.stringify(r)}\n`);
      process.exit(0);
    })
    .catch((err) => {
      console.error(`ERROR: ${err.message}`);
      process.exit(1);
    });
}

module.exports = { enviarReporte };
