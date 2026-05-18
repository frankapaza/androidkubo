require('dotenv').config();
const nodemailer = require('nodemailer');

function buildTransporter() {
  const port = parseInt(process.env.NOTIF_SMTP_PORT || '587', 10);
  return nodemailer.createTransport({
    host:   process.env.NOTIF_SMTP_HOST,
    port,
    secure: port === 465,
    auth: {
      user: process.env.NOTIF_SMTP_USER,
      pass: process.env.NOTIF_SMTP_PASS,
    },
  });
}

function fmtTs(iso) {
  try {
    return new Date(iso).toLocaleString('es-PE', {
      timeZone: 'America/Lima',
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch { return iso || ''; }
}

function row(label, value) {
  return `
    <tr>
      <td style="padding:9px 16px;font-size:12px;font-weight:600;color:#71707b;text-transform:uppercase;
                 letter-spacing:.4px;white-space:nowrap;border-bottom:1px solid #f4f4f5;width:40%">${label}</td>
      <td style="padding:9px 16px;font-size:13px;color:#23232f;
                 border-bottom:1px solid #f4f4f5">${value}</td>
    </tr>`;
}

function buildHtml(estado, displayName) {
  const ok       = estado.status === 'ok';
  const color    = ok ? '#15803d' : '#b91c1c';
  const bgColor  = ok ? '#f0fdf4' : '#fff5f5';
  const dotColor = ok ? '#22c55e' : '#ef4444';
  const titulo   = ok ? 'Ingesta completada correctamente' : 'Error en la ingesta';

  const rows = [
    estado.fechaReporte     ? row('Fecha procesada',    estado.fechaReporte) : '',
    estado.tipoEjecucion    ? row('Tipo ejecución',     estado.tipoEjecucion === 1 ? 'Mañana (datos de ayer)' : 'Tarde (datos de hoy)') : '',
    estado.totalServidores  ? row('Servidores',         String(estado.totalServidores)) : '',
    estado.totalCampanas    ? row('Campañas',           String(estado.totalCampanas)) : '',
    estado.registrosValidos != null
      ? row('Registros insertados', `${estado.registrosValidos}${estado.totalRegistros != null ? ` de ${estado.totalRegistros} recibidos` : ''}`) : '',
    estado.duracion         ? row('Duración',           estado.duracion) : '',
    estado.fase && !ok      ? row('Fase',               estado.fase) : '',
  ].filter(Boolean).join('');

  const errorBlock = !ok && estado.error ? `
    <div style="margin:0 24px 20px;padding:14px 16px;background:#fff5f5;
                border:1px solid #fecaca;border-radius:9px;">
      <div style="font-size:11px;font-weight:600;color:#b91c1c;text-transform:uppercase;
                  letter-spacing:.4px;margin-bottom:6px;">Detalle del error</div>
      <div style="font-family:Consolas,monospace;font-size:12px;color:#7f1d1d;
                  word-break:break-word;line-height:1.5">${estado.error}</div>
    </div>` : '';

  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:24px;background:#f4f4f5;font-family:'Segoe UI',system-ui,sans-serif">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:13px;
              overflow:hidden;border:1px solid #e6e6ea;box-shadow:0 2px 8px rgba(8,7,14,.07)">

    <!-- Header -->
    <div style="background:#08070e;padding:16px 24px;display:flex;align-items:center;gap:10px">
      <div style="width:28px;height:28px;background:linear-gradient(135deg,#3d3d4b,#51515d);
                  border-radius:7px;display:flex;align-items:center;justify-content:center;flex-shrink:0">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="#f9f9fb">
          <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
        </svg>
      </div>
      <span style="font-size:14px;font-weight:700;color:#f9f9fb;letter-spacing:-.2px">Kubot</span>
      <span style="color:#3d3d4b;font-size:14px">/</span>
      <span style="font-size:12px;color:#71717a">${displayName}</span>
    </div>

    <!-- Status banner -->
    <div style="padding:18px 24px;border-bottom:1px solid #f4f4f5;background:${bgColor}">
      <div style="display:flex;align-items:center;gap:12px">
        <div style="width:10px;height:10px;border-radius:50%;background:${dotColor};flex-shrink:0"></div>
        <div style="flex:1">
          <div style="font-size:14px;font-weight:600;color:${color}">${titulo}</div>
          <div style="font-size:11px;color:#a1a1aa;margin-top:2px">${fmtTs(estado.timestamp)}</div>
        </div>
        ${estado.duracion ? `<div style="font-size:12px;color:#71707b;background:#fff;border:1px solid #e6e6ea;
            padding:4px 12px;border-radius:999px;white-space:nowrap">${estado.duracion}</div>` : ''}
      </div>
    </div>

    <!-- Metrics table -->
    <table style="width:100%;border-collapse:collapse;margin:0">
      <tbody>${rows}</tbody>
    </table>

    ${errorBlock}

    <!-- Footer -->
    <div style="padding:14px 24px;border-top:1px solid #f4f4f5;
                font-size:11px;color:#a1a1aa;text-align:center">
      Kubot Automatizaciones · ContactoEficaz
    </div>

  </div>
</body>
</html>`;
}

async function notificarEjecucion(estado, displayName) {
  const to = process.env.NOTIF_MAIL_TO;
  if (!to || !process.env.NOTIF_SMTP_HOST || !process.env.NOTIF_SMTP_USER) return;

  const ok    = estado.status === 'ok';
  const fecha = estado.fechaReporte || new Date().toLocaleDateString('es-PE', { timeZone: 'America/Lima' });
  const icon  = ok ? '✓' : '✗';
  const subject = `${icon} ${displayName} — ${ok ? 'Ingesta completada' : 'Error en ingesta'} [${fecha}]`;

  const transporter = buildTransporter();
  await transporter.sendMail({
    from: `"Kubot Automatizaciones" <${process.env.NOTIF_SMTP_USER}>`,
    to,
    subject,
    html: buildHtml(estado, displayName),
  });

  console.log(`[notificar] Correo enviado a ${to}`);
}

module.exports = { notificarEjecucion };
