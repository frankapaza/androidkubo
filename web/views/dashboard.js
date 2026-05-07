function esc(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function screenshotUrl(p) {
  if (!p || typeof p !== 'string') return null;
  const base = p.replace(/\\/g, '/').split('/').pop();
  if (!base || !/\.png$/i.test(base)) return null;
  if (!/^(error_|mibanco_|surgir_)/.test(base)) return null;
  return '/api/screenshot/' + encodeURIComponent(base);
}

function formatDeploy(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    const fecha = d.toLocaleDateString('es-PE', {
      day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Lima',
    });
    const hora = d.toLocaleTimeString('es-PE', {
      hour: '2-digit', minute: '2-digit', timeZone: 'America/Lima',
    });
    return `${fecha} ${hora}`;
  } catch { return ''; }
}

function relativeTime(ts) {
  if (!ts) return null;
  const diff = Date.now() - new Date(ts).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'hace menos de 1 minuto';
  if (m < 60) return `hace ${m} minuto${m>1?'s':''}`;
  const h = Math.floor(m / 60);
  if (h < 24) return `hace ${h} hora${h>1?'s':''}`;
  const d = Math.floor(h / 24);
  return `hace ${d} día${d>1?'s':''}`;
}

function statusInfo(lastRun) {
  if (!lastRun) return { label:'Sin datos', color:'#a1a1aa', bg:'#f4f4f5', dot:'#d3d3d9', icon:'clock' };
  return lastRun.status === 'ok'
    ? { label:'Exitoso',   color:'#15803d', bg:'#f0fdf4', dot:'#22c55e', icon:'check' }
    : { label:'Con error', color:'#b91c1c', bg:'#fff5f5', dot:'#ef4444', icon:'error' };
}

const ICONS = {
  check: '<path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>',
  error: '<path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>',
  clock: '<path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z"/>',
};

function renderCard(clientId, autoId, auto, lastRun, isAdminView) {
  const s = statusInfo(lastRun);
  const rel = lastRun ? relativeTime(lastRun.timestamp) : null;

  const metrics = lastRun ? [
    lastRun.archivoNombre ? { l:'Archivo',    v:`<code>${esc(lastRun.archivoNombre)}</code>` } : null,
    lastRun.tamaño        ? { l:'Tamaño',     v: esc(lastRun.tamaño) } : null,
    lastRun.duracion      ? { l:'Duración',   v: esc(lastRun.duracion) } : null,
    lastRun.correoEnviado ? { l:'Enviado a',  v: esc(lastRun.correoEnviado) } : null,
    lastRun.folderDestino ? { l:'Destino',    v:`<code class="sm">${esc(lastRun.folderDestino)}</code>` } : null,
    lastRun.fechaReporte  ? { l:'Reporte',    v: esc(lastRun.fechaReporte) } : null,
  ].filter(Boolean) : [];

  return `
<section class="acard" id="card-${esc(autoId)}">

  <!-- Card header -->
  <div class="acard-hdr" style="border-left:3px solid ${esc(auto.color||'#3d3d4b')}">
    <div class="acard-hdr-info">
      <h2 class="acard-title">${esc(auto.displayName)}</h2>
      <div class="acard-meta">
        <span class="status-pill" style="background:${s.bg};color:${s.color}">
          <span class="sdot" style="background:${s.dot}"></span>${s.label}
        </span>
        ${rel ? `<span class="meta-sep">·</span><span class="acard-time">${rel}</span>` : ''}
      </div>
    </div>
    <button class="btn-send-now" id="btnSend-${esc(autoId)}" onclick="openSendNow('${esc(autoId)}','${esc(auto.displayName)}')">
      <svg viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
      Enviar ahora
    </button>
  </div>

  <!-- Tabs -->
  <div class="tabs-bar">
    <button class="tab active" onclick="switchTab('${esc(autoId)}','run',this)">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 14l-5-5 1.41-1.41L12 14.17l7.59-7.59L21 8l-9 9z"/></svg>
      Ejecución
    </button>
    <button class="tab" onclick="switchTab('${esc(autoId)}','cfg',this)">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M19.14,12.94c0.04-0.3,0.06-0.61,0.06-0.94c0-0.32-0.02-0.64-0.07-0.94l2.03-1.58c0.18-0.14,0.23-0.41,0.12-0.61 l-1.92-3.32c-0.12-0.22-0.37-0.29-0.59-0.22l-2.39,0.96c-0.5-0.38-1.03-0.7-1.62-0.94L14.4,2.81c-0.04-0.24-0.24-0.41-0.48-0.41 h-3.84c-0.24,0-0.43,0.17-0.47,0.41L9.25,5.35C8.66,5.59,8.12,5.92,7.63,6.29L5.24,5.33c-0.22-0.08-0.47,0-0.59,0.22L2.74,8.87 C2.62,9.08,2.66,9.34,2.86,9.48l2.03,1.58C4.84,11.36,4.8,11.69,4.8,12s0.02,0.64,0.07,0.94l-2.03,1.58 c-0.18,0.14-0.23,0.41-0.12,0.61l1.92,3.32c0.12,0.22,0.37,0.29,0.59,0.22l2.39-0.96c0.5,0.38,1.03,0.7,1.62,0.94l0.36,2.54 c0.05,0.24,0.24,0.41,0.48,0.41h3.84c0.24,0,0.44-0.17,0.47-0.41l0.36-2.54c0.59-0.24,1.13-0.56,1.62-0.94l2.39,0.96 c0.22,0.08,0.47,0,0.59-0.22l1.92-3.32c0.12-0.22,0.07-0.47-0.12-0.61L19.14,12.94z M12,15.6c-1.98,0-3.6-1.62-3.6-3.6 s1.62-3.6,3.6-3.6s3.6,1.62,3.6,3.6S13.98,15.6,12,15.6z"/></svg>
      Configuración
    </button>
    <button class="tab" onclick="switchTab('${esc(autoId)}','hist',this)">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M13 3c-4.97 0-9 4.03-9 9H1l3.89 3.89.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42C8.27 19.99 10.51 21 13 21c4.97 0 9-4.03 9-9s-4.03-9-9-9zm-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8H12z"/></svg>
      Historial
    </button>
  </div>

  <!-- Panel: Ejecución -->
  <div id="${esc(autoId)}-run" class="tab-panel">
    ${lastRun ? `
    <!-- Status banner -->
    <div class="status-banner" style="background:${s.bg};border-color:${s.dot}20">
      <div class="status-banner-left">
        <div class="status-icon-wrap" style="background:${s.dot}20">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="${s.dot}">${ICONS[s.icon]}</svg>
        </div>
        <div>
          <div class="status-banner-title" style="color:${s.color}">${s.label}</div>
          <div class="status-banner-sub">${esc(lastRun.timestamp || '')}</div>
        </div>
      </div>
      ${lastRun.duracion ? `<div class="status-banner-dur">${esc(lastRun.duracion)}</div>` : ''}
    </div>
    ${lastRun.error ? `
    <div class="error-block">
      <div class="error-block-title">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="#b91c1c"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>
        Detalle del error
      </div>
      <div class="error-block-msg">${esc(lastRun.error)}</div>
    </div>` : ''}
    ${metrics.length ? `
    <div class="metrics-grid">
      ${metrics.map(m => `<div class="metric"><span class="metric-lbl">${m.l}</span><span class="metric-val">${m.v}</span></div>`).join('')}
    </div>` : ''}
    ${(() => {
      const url = screenshotUrl(lastRun.screenshot);
      if (!url) return '';
      const isErr = lastRun.status !== 'ok';
      return `
      <div class="shot-block">
        <div class="shot-hdr">
          <span class="shot-lbl">${isErr ? 'Captura del error' : 'Captura del archivo subido'}</span>
          <a class="shot-open" href="${url}" target="_blank" rel="noopener">Abrir tamaño completo ↗</a>
        </div>
        <a href="${url}" target="_blank" rel="noopener"><img class="shot-img" src="${url}" alt="captura"></a>
      </div>`;
    })()}
    ` : `
    <div class="no-data">
      <svg width="36" height="36" viewBox="0 0 24 24" fill="#d3d3d9"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 3c1.93 0 3.5 1.57 3.5 3.5S13.93 13 12 13s-3.5-1.57-3.5-3.5S10.07 6 12 6zm7 13H5v-.23c0-.62.28-1.2.76-1.58C7.47 15.82 9.64 15 12 15s4.53.82 6.24 2.19c.48.38.76.97.76 1.58V19z"/></svg>
      <p>Sin ejecuciones registradas</p>
    </div>`}

    <div class="run-bar" id="running-${esc(autoId)}">
      <div class="run-bar-inner">
        <span class="spin-dark"></span>
        <span>Proceso en ejecución — puede tardar varios minutos...</span>
      </div>
    </div>
    <div id="result-${esc(autoId)}"></div>
  </div>

  <!-- Panel: Historial -->
  <div id="${esc(autoId)}-hist" class="tab-panel" style="display:none">
    <div class="hist-toolbar">
      <select class="hist-select" id="histMonth-${esc(autoId)}" onchange="renderHistTable('${esc(autoId)}')">
        <option value="">Todos los meses</option>
      </select>
      <span class="hist-count" id="histCount-${esc(autoId)}"></span>
    </div>
    <div id="histBody-${esc(autoId)}">
      <div class="hist-empty"><svg width="36" height="36" viewBox="0 0 24 24"><path d="M13 3c-4.97 0-9 4.03-9 9H1l3.89 3.89.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42C8.27 19.99 10.51 21 13 21c4.97 0 9-4.03 9-9s-4.03-9-9-9zm-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8H12z"/></svg><p>Cargando historial...</p></div>
    </div>
  </div>

  <!-- Panel: Config -->
  <div id="${esc(autoId)}-cfg" class="tab-panel" style="display:none">
    <div class="cfg-grid" id="cfg-${esc(autoId)}">
      <div class="cfg-loading">Cargando configuración...</div>
    </div>
    <div class="cfg-actions">
      <button class="btn-save" id="btnSave-${esc(autoId)}" onclick="saveConfig('${esc(clientId)}','${esc(autoId)}')">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M17 3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V7l-4-4zm-5 16c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3zm3-10H5V5h10v4z"/></svg>
        Guardar cambios
      </button>
      <button class="btn-reload" onclick="loadConfig('${esc(clientId)}','${esc(autoId)}')">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/></svg>
        Recargar
      </button>
    </div>
  </div>

</section>`;
}

function renderDashboard(user, client, lastRuns, opts = {}) {
  const isAdminView = opts.isAdminView || false;
  const viewClientId = opts.viewClientId || user.clientId;
  const version = opts.version || null;
  const deployStr = version ? formatDeploy(version.deployDate) : '';
  const cards = Object.entries(client.automations)
    .map(([id, auto]) => renderCard(viewClientId, id, auto, lastRuns[id] || null, isAdminView))
    .join('\n');

  const allOk = Object.values(lastRuns).every(r => r && r.status === 'ok');
  const anyError = Object.values(lastRuns).some(r => r && r.status !== 'ok');
  const globalStatus = !Object.keys(lastRuns).length ? 'idle'
    : anyError ? 'error' : allOk ? 'ok' : 'idle';

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Kubot — ${esc(client.displayName)}</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    html{scroll-behavior:smooth}
    body{font-family:'Segoe UI',system-ui,-apple-system,sans-serif;background:#f4f4f5;color:#23232f;min-height:100vh}

    /* ─── Header ─── */
    .hdr{background:#08070e;height:56px;display:flex;align-items:center;padding:0 24px;position:sticky;top:0;z-index:50;border-bottom:1px solid rgba(255,255,255,.05)}
    .hdr-left{display:flex;align-items:center;gap:12px;flex:1;min-width:0}
    .logo-mark{width:32px;height:32px;background:linear-gradient(135deg,#3d3d4b,#51515d);border-radius:8px;display:flex;align-items:center;justify-content:center;flex-shrink:0}
    .logo-mark svg{width:16px;height:16px;fill:#f9f9fb}
    .logo-name{font-size:15px;font-weight:700;color:#f9f9fb;letter-spacing:-.3px}
    .bc-sep{color:#3d3d4b;font-size:16px;margin:0 2px}
    .bc-client{font-size:13px;color:#71707b;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .global-dot{width:7px;height:7px;border-radius:50%;flex-shrink:0;${globalStatus==='ok'?'background:#22c55e':globalStatus==='error'?'background:#ef4444':'background:#51515d'}}
    .hdr-right{display:flex;align-items:center;gap:10px;flex-shrink:0}
    .hdr-user{font-size:12px;color:#51515d;font-weight:500}
    .hdr-version{font-size:11px;color:#71707b;font-weight:500;background:#171622;border:1px solid #23232f;padding:4px 9px;border-radius:6px;font-family:'Consolas','Menlo',monospace;letter-spacing:.2px;cursor:help;white-space:nowrap}
    .btn-logout{background:transparent;border:1px solid #23232f;color:#51515d;padding:5px 12px;border-radius:7px;cursor:pointer;font-size:12px;font-weight:500;transition:all .15s}
    .btn-logout:hover{border-color:#3d3d4b;color:#a1a1aa}
    .btn-back{display:inline-flex;align-items:center;gap:6px;background:#23232f;color:#a1a1aa;border:none;padding:6px 13px;border-radius:7px;cursor:pointer;font-size:12px;font-weight:500;text-decoration:none;transition:all .15s}
    .btn-back:hover{background:#3d3d4b;color:#f9f9fb}

    /* ─── Layout ─── */
    .page{max-width:900px;margin:0 auto;padding:24px 20px;display:grid;gap:16px}

    /* ─── Automation Card ─── */
    .acard{background:#fff;border:1px solid #e6e6ea;border-radius:13px;overflow:hidden;box-shadow:0 1px 3px rgba(8,7,14,.05)}
    .acard-hdr{padding:16px 22px;border-bottom:1px solid #f4f4f5;display:flex;align-items:center;justify-content:space-between;gap:12px}
    .acard-hdr-info{display:flex;flex-direction:column;gap:6px}
    .acard-title{font-size:15px;font-weight:600;color:#171622;letter-spacing:-.2px}
    .acard-meta{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
    .status-pill{display:inline-flex;align-items:center;gap:5px;padding:3px 10px;border-radius:999px;font-size:11px;font-weight:600}
    .sdot{width:6px;height:6px;border-radius:50%;flex-shrink:0}
    .meta-sep{color:#d3d3d9;font-size:13px}
    .acard-time{font-size:12px;color:#a1a1aa}
    .btn-send-now{display:inline-flex;align-items:center;gap:6px;padding:7px 14px;background:#171622;color:#f9f9fb;border:none;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;transition:all .15s;flex-shrink:0;letter-spacing:.1px}
    .btn-send-now:hover{background:#08070e;transform:translateY(-1px);box-shadow:0 4px 10px rgba(8,7,14,.18)}
    .btn-send-now:active{transform:translateY(0)}
    .btn-send-now:disabled{background:#d3d3d9;color:#a1a1aa;cursor:not-allowed;transform:none;box-shadow:none}
    .btn-send-now svg{width:13px;height:13px;fill:currentColor}
    .send-chk{display:flex;align-items:flex-start;gap:9px;padding:11px 13px;background:#f9f9fb;border:1.5px solid #e6e6ea;border-radius:9px;cursor:pointer;transition:all .15s}
    .send-chk:hover{border-color:#d3d3d9;background:#f4f4f5}
    .send-chk input{margin-top:1px;cursor:pointer;width:15px;height:15px;accent-color:#171622}
    .send-chk-text{font-size:13px;color:#23232f;font-weight:500;line-height:1.4}
    .send-chk-hint{font-size:11px;color:#71707b;margin-top:2px;display:block;font-weight:400}

    /* ─── Tabs ─── */
    .tabs-bar{display:flex;gap:0;border-bottom:1px solid #f4f4f5;padding:0 22px;background:#fff}
    .tab{display:inline-flex;align-items:center;gap:6px;background:none;border:none;border-bottom:2px solid transparent;padding:11px 4px;margin-right:20px;font-size:13px;font-weight:500;color:#a1a1aa;cursor:pointer;transition:all .15s;margin-bottom:-1px}
    .tab:hover{color:#51515d}
    .tab.active{color:#171622;border-bottom-color:#23232f}
    .tab-panel{padding:20px 22px}

    /* ─── Status banner ─── */
    .status-banner{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 16px;border:1px solid;border-radius:10px;margin-bottom:16px;flex-wrap:wrap}
    .status-banner-left{display:flex;align-items:center;gap:12px}
    .status-icon-wrap{width:36px;height:36px;border-radius:9px;display:flex;align-items:center;justify-content:center;flex-shrink:0}
    .status-banner-title{font-size:14px;font-weight:600}
    .status-banner-sub{font-size:11px;color:#a1a1aa;margin-top:2px}
    .status-banner-dur{font-size:13px;color:#71707b;font-weight:500;background:#fff;border:1px solid #e6e6ea;padding:4px 12px;border-radius:999px}

    /* ─── Error block ─── */
    .error-block{background:#fff5f5;border:1px solid #fecaca;border-radius:9px;padding:14px 16px;margin-bottom:16px}
    .error-block-title{display:flex;align-items:center;gap:6px;font-size:12px;font-weight:600;color:#b91c1c;margin-bottom:8px;text-transform:uppercase;letter-spacing:.4px}
    .error-block-msg{font-family:'Consolas','Menlo',monospace;font-size:12px;color:#7f1d1d;word-break:break-word;line-height:1.5}

    /* ─── Metrics grid ─── */
    .metrics-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:1px;background:#e6e6ea;border:1px solid #e6e6ea;border-radius:9px;overflow:hidden}
    .metric{background:#fff;padding:11px 14px;display:flex;flex-direction:column;gap:4px}
    .metric:hover{background:#f9f9fb}
    .metric-lbl{font-size:11px;font-weight:600;color:#a1a1aa;text-transform:uppercase;letter-spacing:.4px}
    .metric-val{font-size:13px;color:#23232f;word-break:break-word}
    code{font-family:'Consolas','Menlo',monospace;font-size:12px;background:#f4f4f5;padding:1px 5px;border-radius:4px;color:#3d3d4b}
    .sm{font-size:11px}

    /* ─── Screenshot block ─── */
    .shot-block{margin-top:14px;border:1px solid #e6e6ea;border-radius:9px;background:#f9f9fb;padding:10px 12px}
    .shot-hdr{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;flex-wrap:wrap;gap:6px}
    .shot-lbl{font-size:11px;font-weight:600;color:#71707b;text-transform:uppercase;letter-spacing:.4px}
    .shot-open{font-size:11px;color:#3d3d4b;text-decoration:none;font-weight:500}
    .shot-open:hover{text-decoration:underline}
    .shot-img{max-width:100%;border-radius:7px;border:1px solid #e6e6ea;display:block;background:#fff}

    /* ─── No data ─── */
    .no-data{display:flex;flex-direction:column;align-items:center;gap:10px;padding:32px;color:#a1a1aa}
    .no-data p{font-size:13px}

    /* ─── Run actions ─── */
    .run-actions{margin-top:18px;padding-top:16px;border-top:1px solid #f4f4f5}
    .btn-run{display:inline-flex;align-items:center;gap:7px;padding:10px 20px;background:#171622;color:#f9f9fb;border:none;border-radius:9px;font-size:13px;font-weight:600;cursor:pointer;transition:all .15s;letter-spacing:.1px}
    .btn-run:hover{background:#08070e;transform:translateY(-1px);box-shadow:0 4px 12px rgba(8,7,14,.2)}
    .btn-run:active{transform:translateY(0)}
    .btn-run:disabled{background:#d3d3d9;color:#a1a1aa;cursor:not-allowed;transform:none;box-shadow:none}
    .run-bar{display:none;margin-top:14px}
    .run-bar-inner{display:flex;align-items:center;gap:10px;background:#f9f9fb;border:1px solid #e6e6ea;border-radius:9px;padding:12px 16px;font-size:13px;color:#71707b}
    .spin-dark{display:inline-block;width:14px;height:14px;border:2px solid #e6e6ea;border-top-color:#3d3d4b;border-radius:50%;animation:spin .7s linear infinite;flex-shrink:0}
    .result-ok{background:#f0fdf4;border:1px solid #bbf7d0;border-radius:9px;padding:12px 16px;font-size:13px;color:#15803d;margin-top:12px;display:flex;align-items:center;gap:8px}
    .result-err{background:#fff5f5;border:1px solid #fecaca;border-radius:9px;padding:12px 16px;font-size:13px;color:#b91c1c;margin-top:12px}
    .log-pre{background:#08070e;color:#d3d3d9;padding:16px;border-radius:9px;font-family:'Consolas','Menlo',monospace;font-size:12px;white-space:pre-wrap;word-break:break-all;max-height:260px;overflow-y:auto;margin-top:10px;line-height:1.6}

    /* ─── Config ─── */
    .cfg-grid{display:grid;gap:14px}
    .cfg-loading{font-size:13px;color:#a1a1aa;padding:8px 0}
    .fld{display:flex;flex-direction:column;gap:6px}
    .fld label{font-size:11px;font-weight:600;color:#71707b;text-transform:uppercase;letter-spacing:.4px}
    .fld input{padding:10px 13px;border:1.5px solid #e6e6ea;border-radius:8px;font-size:13px;color:#23232f;outline:none;background:#fff;transition:border-color .2s,box-shadow .2s}
    .fld input:focus{border-color:#3d3d4b;box-shadow:0 0 0 3px rgba(61,61,75,.09)}
    .fld input::placeholder{color:#a1a1aa}
    .fld input[readonly]{background:#f9f9fb;color:#a1a1aa;cursor:not-allowed}
    .fld-hint{font-size:11px;color:#a1a1aa}
    .cfg-actions{display:flex;gap:8px;margin-top:18px;padding-top:16px;border-top:1px solid #f4f4f5}
    .btn-save{display:inline-flex;align-items:center;gap:6px;padding:9px 18px;background:#171622;color:#f9f9fb;border:none;border-radius:8px;font-size:13px;font-weight:500;cursor:pointer;transition:all .15s}
    .btn-save:hover{background:#08070e}
    .btn-save:disabled{background:#d3d3d9;cursor:not-allowed}
    .btn-reload{display:inline-flex;align-items:center;gap:6px;padding:9px 14px;background:#f4f4f5;color:#51515d;border:1px solid #e6e6ea;border-radius:8px;font-size:13px;font-weight:500;cursor:pointer;transition:all .15s}
    .btn-reload:hover{background:#e6e6ea}

    /* ─── History ─── */
    .hist-toolbar{display:flex;align-items:center;gap:10px;margin-bottom:14px;flex-wrap:wrap}
    .hist-select{padding:7px 10px;border:1.5px solid #e6e6ea;border-radius:8px;font-size:12px;color:#23232f;outline:none;background:#fff;cursor:pointer;transition:border-color .2s}
    .hist-select:focus{border-color:#3d3d4b}
    .hist-count{font-size:12px;color:#a1a1aa;margin-left:auto}
    .hist-table{width:100%;border-collapse:collapse;font-size:12px}
    .hist-table thead tr{background:#f9f9fb}
    .hist-table th{padding:9px 12px;text-align:left;font-size:11px;font-weight:600;color:#a1a1aa;text-transform:uppercase;letter-spacing:.4px;border-bottom:1px solid #e6e6ea;white-space:nowrap}
    .hist-table td{padding:10px 12px;border-bottom:1px solid #f4f4f5;vertical-align:middle;color:#23232f}
    .hist-table tr:last-child td{border-bottom:none}
    .hist-table tbody tr:hover td{background:#f9f9fb}
    .hst-ok{display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:999px;background:#f0fdf4;color:#15803d;font-size:11px;font-weight:600}
    .hst-err{display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:999px;background:#fff5f5;color:#b91c1c;font-size:11px;font-weight:600}
    .hst-dot{width:5px;height:5px;border-radius:50%;flex-shrink:0}
    .hist-empty{display:flex;flex-direction:column;align-items:center;gap:8px;padding:32px;color:#a1a1aa}
    .hist-empty svg{fill:#e6e6ea}
    .hist-empty p{font-size:13px}
    .hist-err-tip{font-size:11px;color:#a1a1aa;max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;cursor:help}
    .btn-retry{display:inline-flex;align-items:center;gap:4px;padding:5px 10px;background:#fff5f5;color:#b91c1c;border:1px solid #fecaca;border-radius:6px;font-size:11px;font-weight:600;cursor:pointer;transition:all .15s;white-space:nowrap}
    .btn-retry:hover{background:#fee2e2;border-color:#fca5a5}
    .btn-retry:disabled{background:#f4f4f5;color:#a1a1aa;border-color:#e6e6ea;cursor:not-allowed}
    .btn-retry svg{width:11px;height:11px;fill:currentColor}
    .spin-sm{display:inline-block;width:11px;height:11px;border:1.5px solid #fecaca;border-top-color:#b91c1c;border-radius:50%;animation:spin .7s linear infinite}

    /* ─── Toast ─── */
    .toast{position:fixed;bottom:28px;right:28px;padding:12px 18px;border-radius:10px;font-size:13px;font-weight:500;z-index:999;box-shadow:0 8px 28px rgba(8,7,14,.25);display:none;align-items:center;gap:8px;max-width:320px}
    .toast.show{display:flex;animation:slideUp .2s ease}
    .tok-ok{background:#171622;color:#f9f9fb}
    .tok-err{background:#ef4444;color:#fff}

    /* ─── Confirm modal ─── */
    .overlay{display:none;position:fixed;inset:0;background:rgba(8,7,14,.55);z-index:100;align-items:center;justify-content:center;padding:20px;backdrop-filter:blur(2px)}
    .overlay.open{display:flex;animation:fadeIn .15s ease}
    @keyframes fadeIn{from{opacity:0}to{opacity:1}}
    .modal{background:#fff;border-radius:14px;width:100%;max-width:380px;box-shadow:0 20px 60px rgba(8,7,14,.3);animation:slideUp .2s ease}
    .modal-hdr{padding:20px 22px 0;display:flex;align-items:flex-start;justify-content:space-between}
    .modal-hdr-info h3{font-size:15px;font-weight:600;color:#171622}
    .modal-hdr-info p{font-size:12px;color:#71707b;margin-top:3px}
    .btn-close{background:none;border:none;cursor:pointer;padding:2px;color:#a1a1aa;transition:color .15s;margin-left:12px;flex-shrink:0}
    .btn-close:hover{color:#23232f}
    .btn-close svg{width:18px;height:18px;fill:currentColor}
    .modal-body{padding:16px 22px;display:flex;flex-direction:column;gap:12px}
    .modal-footer{padding:0 22px 20px;display:flex;gap:8px;justify-content:flex-end}
    .btn-cancel{display:inline-flex;align-items:center;padding:8px 14px;background:#f4f4f5;color:#51515d;border:1px solid #e6e6ea;border-radius:8px;font-size:13px;font-weight:500;cursor:pointer;transition:all .15s}
    .btn-cancel:hover{background:#e6e6ea}
    .btn-confirm{display:inline-flex;align-items:center;gap:6px;padding:8px 16px;background:#171622;color:#f9f9fb;border:none;border-radius:8px;font-size:13px;font-weight:500;cursor:pointer;transition:all .15s}
    .btn-confirm:hover{background:#08070e}
    .btn-confirm:disabled{background:#d3d3d9;cursor:not-allowed}
    .modal-err{font-size:12px;color:#b91c1c;background:#fff5f5;border:1px solid #fecaca;padding:8px 12px;border-radius:7px;display:none}

    @keyframes spin{to{transform:rotate(360deg)}}
    @keyframes slideUp{from{transform:translateY(8px);opacity:0}to{transform:translateY(0);opacity:1}}
    @media(max-width:600px){.metrics-grid{grid-template-columns:1fr 1fr}.status-banner{flex-direction:column;align-items:flex-start}}
  </style>
</head>
<body>

<header class="hdr">
  <div class="hdr-left">
    <div class="logo-mark"><svg viewBox="0 0 24 24"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg></div>
    <span class="logo-name">Kubot</span>
    <span class="bc-sep">/</span>
    <span class="bc-client">${esc(client.displayName)}</span>
    <div class="global-dot" title="Estado general"></div>
  </div>
  <div class="hdr-right">
    ${version ? `<span class="hdr-version" title="Commit ${esc(version.commit)} — Deploy ${esc(deployStr)}">${esc(version.version)}${deployStr ? ` · ${esc(deployStr)}` : ''}</span>` : ''}
    ${isAdminView
      ? `<a href="/admin" class="btn-back"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>Volver al admin</a>`
      : `<span class="hdr-user">${esc(user.username)}</span>
         <form method="POST" action="/logout" style="margin:0"><button class="btn-logout" type="submit">Salir</button></form>`
    }
  </div>
</header>

<main class="page">
  ${cards}
</main>

<div id="toast" class="toast"></div>

<!-- Modal: Enviar ahora -->
<div class="overlay" id="sendOverlay">
  <div class="modal">
    <div class="modal-hdr">
      <div class="modal-hdr-info">
        <h3>Enviar ahora</h3>
        <p><strong id="sendAutoName" style="color:#171622"></strong> se ejecutará inmediatamente.</p>
      </div>
      <button class="btn-close" onclick="closeSendModal()"><svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg></button>
    </div>
    <div class="modal-body">
      <label class="send-chk">
        <input type="checkbox" id="sendSkipChk">
        <span>
          <span class="send-chk-text">Cancelar la ejecución programada de hoy</span>
          <span class="send-chk-hint">Si no marcas esto, el envío programado del día también se ejecutará a su horario.</span>
        </span>
      </label>
    </div>
    <div class="modal-footer">
      <button class="btn-cancel" onclick="closeSendModal()">Cancelar</button>
      <button class="btn-confirm" id="btnConfirmSend" onclick="confirmSendNow()">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
        Ejecutar ahora
      </button>
    </div>
  </div>
</div>

<!-- Modal: Confirmar identidad para guardar config -->
<div class="overlay" id="saveOverlay">
  <div class="modal">
    <div class="modal-hdr">
      <div class="modal-hdr-info">
        <h3>Confirmar cambios</h3>
        <p>Ingresa tus credenciales para guardar la configuración</p>
      </div>
      <button class="btn-close" onclick="closeSaveModal()"><svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg></button>
    </div>
    <div class="modal-body">
      <div class="fld">
        <label>Usuario</label>
        <input type="text" id="confirmUser" autocomplete="username" placeholder="tu_usuario">
      </div>
      <div class="fld">
        <label>Contraseña</label>
        <input type="password" id="confirmPass" autocomplete="current-password" placeholder="••••••••">
      </div>
      <div class="modal-err" id="confirmErr">Usuario o contraseña incorrectos</div>
    </div>
    <div class="modal-footer">
      <button class="btn-cancel" onclick="closeSaveModal()">Cancelar</button>
      <button class="btn-confirm" id="btnConfirmSave" onclick="confirmSave()">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M17 3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V7l-4-4zm-5 16c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3zm3-10H5V5h10v4z"/></svg>
        Guardar
      </button>
    </div>
  </div>
</div>

<script>
const CID = '${esc(viewClientId)}';
const IS_ADMIN = ${isAdminView};

function esc(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

function toast(msg, ok=true) {
  const t = document.getElementById('toast');
  t.className = 'toast show '+(ok?'tok-ok':'tok-err');
  t.innerHTML = (ok
    ? '<svg width="15" height="15" viewBox="0 0 24 24" fill="#4ade80"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>'
    : '<svg width="15" height="15" viewBox="0 0 24 24" fill="#fff"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>'
  ) + esc(msg);
  clearTimeout(t._t);
  t._t = setTimeout(()=>{ t.className='toast'; }, 3200);
}

const _histCache = {};

function switchTab(autoId, panel, btn) {
  ['run','cfg','hist'].forEach(p => {
    document.getElementById(autoId+'-'+p).style.display = p===panel ? '' : 'none';
  });
  btn.closest('.tabs-bar').querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  if (panel === 'cfg') loadConfig(CID, autoId);
  if (panel === 'hist') loadHistory(CID, autoId);
}

async function loadHistory(clientId, autoId) {
  if (_histCache[autoId]) { renderHistTable(autoId); return; }
  try {
    const r = await fetch('/api/clients/'+clientId+'/automations/'+autoId+'/history');
    const { history } = await r.json();
    _histCache[autoId] = history;

    // Populate month filter
    const months = [...new Set(history.map(h => h.timestamp ? h.timestamp.slice(0,7) : null).filter(Boolean))];
    const sel = document.getElementById('histMonth-'+autoId);
    months.forEach(m => {
      const [y, mo] = m.split('-');
      const label = new Date(y, mo-1).toLocaleDateString('es-PE', {month:'long', year:'numeric'});
      const opt = document.createElement('option');
      opt.value = m; opt.textContent = label.charAt(0).toUpperCase()+label.slice(1);
      sel.appendChild(opt);
    });
    if (months.length > 0) sel.value = months[0];
    renderHistTable(autoId);
  } catch {
    document.getElementById('histBody-'+autoId).innerHTML = '<div class="hist-empty"><p style="color:#ef4444">Error al cargar historial</p></div>';
  }
}

function renderHistTable(autoId) {
  const history = _histCache[autoId] || [];
  const month = document.getElementById('histMonth-'+autoId).value;
  const rows = month ? history.filter(h => h.timestamp && h.timestamp.startsWith(month)) : history;
  const countEl = document.getElementById('histCount-'+autoId);
  countEl.textContent = rows.length + ' ejecuci' + (rows.length === 1 ? 'ón' : 'ones');

  if (!rows.length) {
    document.getElementById('histBody-'+autoId).innerHTML = '<div class="hist-empty"><svg width="32" height="32" viewBox="0 0 24 24"><path d="M13 3c-4.97 0-9 4.03-9 9H1l3.89 3.89.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42C8.27 19.99 10.51 21 13 21c4.97 0 9-4.03 9-9s-4.03-9-9-9zm-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8H12z"/></svg><p>Sin ejecuciones para este período</p></div>';
    return;
  }

  const fmt = ts => {
    if (!ts) return '—';
    const d = new Date(ts);
    return d.toLocaleDateString('es-PE',{day:'2-digit',month:'2-digit',year:'numeric'}) + ' ' +
           d.toLocaleTimeString('es-PE',{hour:'2-digit',minute:'2-digit'});
  };

  document.getElementById('histBody-'+autoId).innerHTML = \`<table class="hist-table">
    <thead><tr>
      <th>Fecha</th><th>Estado</th><th>Archivo</th><th>Tamaño</th><th>Duración</th><th>Detalle</th><th>Acción</th>
    </tr></thead>
    <tbody>\${rows.map(h => \`
      <tr>
        <td style="white-space:nowrap;color:#51515d">\${fmt(h.timestamp)}</td>
        <td>\${h.status==='ok'
          ? '<span class="hst-ok"><span class="hst-dot" style="background:#22c55e"></span>OK</span>'
          : '<span class="hst-err"><span class="hst-dot" style="background:#ef4444"></span>Error</span>'}</td>
        <td style="font-family:monospace;font-size:11px;color:#51515d">\${esc(h.archivoNombre||'—')}</td>
        <td style="white-space:nowrap">\${esc(h.tamaño||'—')}</td>
        <td style="white-space:nowrap">\${esc(h.duracion||'—')}</td>
        <td>\${h.error ? \`<span class="hist-err-tip" title="\${esc(h.error)}">\${esc(h.error)}</span>\` : (h.correoEnviado ? '<span style="font-size:11px;color:#a1a1aa">Correo enviado</span>' : (h.folderDestino ? '<span style="font-size:11px;color:#a1a1aa">Subido</span>' : '—'))}</td>
        <td>\${h.status !== 'ok' ? \`<button class="btn-retry" onclick="resendFailed('\${esc(autoId)}', this)"><svg viewBox="0 0 24 24"><path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/></svg>Reenviar</button>\` : '<span style="font-size:11px;color:#d3d3d9">—</span>'}</td>
      </tr>\`).join('')}
    </tbody>
  </table>\`;
}

async function resendFailed(autoId, btn) {
  if (!confirm('¿Reintentar la automatización ahora?\\n\\nSe descargará y procesará el reporte del día de hoy.')) return;
  const orig = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<span class="spin-sm"></span> Reintentando...';
  try {
    const r = await fetch('/api/clients/'+CID+'/automations/'+autoId+'/rerun', { method: 'POST' });
    const d = await r.json();
    if (d.summary?.status === 'ok') {
      toast('✓ Reintento exitoso');
    } else {
      const err = d.summary?.error || d.error || 'Error desconocido';
      toast('Falló: ' + err, false);
    }
    delete _histCache[autoId];
    await loadHistory(CID, autoId);
  } catch {
    toast('Error de conexión', false);
    btn.disabled = false;
    btn.innerHTML = orig;
  }
}

let _sendTarget = null;

function openSendNow(autoId, displayName) {
  _sendTarget = autoId;
  document.getElementById('sendAutoName').textContent = displayName || autoId;
  document.getElementById('sendSkipChk').checked = false;
  document.getElementById('sendOverlay').classList.add('open');
}

function closeSendModal() {
  document.getElementById('sendOverlay').classList.remove('open');
  _sendTarget = null;
}

document.getElementById('sendOverlay').addEventListener('click', e => {
  if (e.target === document.getElementById('sendOverlay')) closeSendModal();
});

async function confirmSendNow() {
  const autoId = _sendTarget;
  if (!autoId) return;
  const skipSchedule = document.getElementById('sendSkipChk').checked;
  closeSendModal();
  await runNow(CID, autoId, skipSchedule);
}

async function runNow(clientId, autoId, skipSchedule = false) {
  const btn = document.getElementById('btnSend-'+autoId);
  const bar = document.getElementById('running-'+autoId);
  const res = document.getElementById('result-'+autoId);
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spin-dark" style="border-color:#3d3d4b;border-top-color:#f9f9fb"></span> Ejecutando...'; }
  if (bar) bar.style.display = 'block';
  if (res) res.innerHTML = '';
  try {
    const r = await fetch('/api/clients/'+clientId+'/automations/'+autoId+'/rerun', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ skipSchedule }),
    });
    const d = await r.json();
    if (d.summary?.status === 'ok') {
      toast('✓ ' + autoId + ' completado' + (skipSchedule ? ' (programado de hoy cancelado)' : ''));
      if (res) res.innerHTML = '<div class="result-ok"><svg width="15" height="15" viewBox="0 0 24 24" fill="#15803d"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>Exitoso · ' + esc(d.summary.duracion||'') + '</div>';
    } else {
      const err = d.summary?.error || d.error || 'Error desconocido';
      toast('Error en ' + autoId, false);
      if (res) {
        res.innerHTML = '<div class="result-err"><strong>Error:</strong> ' + esc(err) + '</div>';
        if (d.stdout) res.innerHTML += '<pre class="log-pre">'+esc(d.stdout)+'</pre>';
      }
    }
  } catch(e) { toast('Error de conexión', false); }
  finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>Enviar ahora'; }
    if (bar) bar.style.display = 'none';
    setTimeout(() => window.location.reload(), 4000);
  }
}

async function loadConfig(clientId, autoId) {
  const el = document.getElementById('cfg-'+autoId);
  el.innerHTML = '<div class="cfg-loading">Cargando...</div>';
  try {
    const r = await fetch('/api/clients/'+clientId+'/automations/'+autoId+'/config');
    const {config} = await r.json();
    el.innerHTML = config.map(f => {
      const inputType = f.secret ? 'password' : f.type === 'number' ? 'number' : f.type === 'time' ? 'time' : 'text';
      const isSchedule = f.type === 'time';
      return \`<div class="fld" \${isSchedule?'style="margin-top:8px;padding-top:16px;border-top:1px solid #f4f4f5"':''}>
        <label>\${esc(f.label)}\${isSchedule?' <span style=\\"font-size:10px;color:#a1a1aa;font-weight:400;text-transform:none\\">(zona horaria: hora Perú UTC−5)</span>':''}</label>
        <input type="\${inputType}"
               name="\${esc(f.key)}"
               value="\${f.secret?'':esc(f.value)}"
               \${f.secret?'placeholder="(sin cambios)"':''}
               \${isSchedule?'style=\\"max-width:140px\\"':''}
               autocomplete="off">
        \${f.secret?'<span class="fld-hint">Dejar vacío para conservar la contraseña actual</span>':''}
        \${isSchedule&&f.value?'<span class="fld-hint">Próxima ejecución: '+esc(f.value)+' h (Perú) → '+nextRunLabel(f.value)+'</span>':''}
      </div>\`;
    }).join('');
  } catch { el.innerHTML = '<div class="cfg-loading" style="color:#ef4444">Error al cargar configuración</div>'; }
}

function nextRunLabel(timeStr) {
  try {
    const [h, m] = timeStr.split(':').map(Number);
    const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Lima' }));
    const run = new Date(now);
    run.setHours(h, m, 0, 0);
    if (run <= now) run.setDate(run.getDate() + 1);
    const diffMs = run - now;
    const diffH = Math.floor(diffMs / 3600000);
    const diffMin = Math.floor((diffMs % 3600000) / 60000);
    const isToday = run.getDate() === now.getDate();
    return (isToday ? 'hoy' : 'mañana') + ' en ' + (diffH > 0 ? diffH + 'h ' : '') + diffMin + 'min';
  } catch { return ''; }
}

let _saveTarget = null;

function saveConfig(clientId, autoId) {
  _saveTarget = { clientId, autoId };
  document.getElementById('confirmUser').value = '';
  document.getElementById('confirmPass').value = '';
  document.getElementById('confirmErr').style.display = 'none';
  document.getElementById('saveOverlay').classList.add('open');
  setTimeout(() => document.getElementById('confirmUser').focus(), 150);
}

function closeSaveModal() {
  document.getElementById('saveOverlay').classList.remove('open');
  _saveTarget = null;
}

document.getElementById('saveOverlay').addEventListener('click', e => {
  if (e.target === document.getElementById('saveOverlay')) closeSaveModal();
});

document.getElementById('confirmPass').addEventListener('keydown', e => {
  if (e.key === 'Enter') confirmSave();
});

async function confirmSave() {
  const username = document.getElementById('confirmUser').value.trim();
  const password = document.getElementById('confirmPass').value;
  const errEl = document.getElementById('confirmErr');
  const btn = document.getElementById('btnConfirmSave');
  if (!username || !password) { errEl.textContent = 'Completa usuario y contraseña'; errEl.style.display = 'block'; return; }
  errEl.style.display = 'none';
  btn.disabled = true; btn.textContent = 'Verificando...';
  try {
    const auth = await fetch('/api/auth/login', {
      method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ username, password }),
    });
    if (!auth.ok) {
      errEl.textContent = 'Usuario o contraseña incorrectos';
      errEl.style.display = 'block';
      btn.disabled = false;
      btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M17 3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V7l-4-4zm-5 16c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3zm3-10H5V5h10v4z"/></svg>Guardar';
      return;
    }
    const { clientId, autoId } = _saveTarget;
    const updates = {};
    document.querySelectorAll('#cfg-'+autoId+' input').forEach(i => { updates[i.name] = i.value; });
    const r = await fetch('/api/clients/'+clientId+'/automations/'+autoId+'/config', {
      method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({updates}),
    });
    closeSaveModal();
    r.ok ? toast('✓ Configuración guardada') : toast('Error al guardar', false);
  } catch { errEl.textContent = 'Error de conexión'; errEl.style.display = 'block'; }
  finally {
    btn.disabled = false;
    btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M17 3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V7l-4-4zm-5 16c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3zm3-10H5V5h10v4z"/></svg>Guardar';
  }
}
</script>
</body>
</html>`;
}

module.exports = { renderDashboard };
