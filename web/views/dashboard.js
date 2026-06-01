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
  if (!lastRun) return { label:'Sin datos', color:'#a1a1aa', bg:'#f4f4f5', dot:'#d3d3d9', icon:'fa-regular fa-clock' };
  return lastRun.status === 'ok'
    ? { label:'Exitoso',   color:'#15803d', bg:'#f0fdf4', dot:'#22c55e', icon:'fa-solid fa-circle-check'       }
    : { label:'Con error', color:'#b91c1c', bg:'#fff5f5', dot:'#ef4444', icon:'fa-solid fa-circle-exclamation' };
}

function renderCard(clientId, autoId, auto, lastRun, isAdminView, enabled = true) {
  const s = statusInfo(lastRun);
  const rel = lastRun ? relativeTime(lastRun.timestamp) : null;

  const metrics = lastRun ? [
    lastRun.archivoNombre    ? { l:'Archivo',    v:`<code>${esc(lastRun.archivoNombre)}</code>` } : null,
    lastRun.tamaño           ? { l:'Tamaño',     v: esc(lastRun.tamaño) } : null,
    lastRun.duracion         ? { l:'Duración',   v: esc(lastRun.duracion) } : null,
    lastRun.correoEnviado    ? { l:'Enviado a',  v: esc(lastRun.correoEnviado) } : null,
    lastRun.folderDestino    ? { l:'Destino',    v:`<code class="sm">${esc(lastRun.folderDestino)}</code>` } : null,
    lastRun.fechaReporte     ? { l:'Reporte',    v: esc(lastRun.fechaReporte) } : null,
    lastRun.registrosValidos != null ? { l:'Registros', v: esc(String(lastRun.registrosValidos)) + (lastRun.totalRegistros != null ? ` / ${esc(String(lastRun.totalRegistros))} total` : '') } : null,
    lastRun.totalCampanas    ? { l:'Campañas',   v: esc(String(lastRun.totalCampanas)) } : null,
    lastRun.totalServidores  ? { l:'Servidores', v: esc(String(lastRun.totalServidores)) } : null,
  ].filter(Boolean) : [];

  return `
<section class="acard${enabled ? '' : ' acard-disabled'}" id="card-${esc(autoId)}" data-enabled="${enabled}">

  <div class="acard-hdr" style="border-left:3px solid ${esc(auto.color||'#3d3d4b')}">
    <div class="acard-hdr-info">
      <h2 class="acard-title">${esc(auto.displayName)}</h2>
      <div class="acard-meta">
        ${enabled
          ? `<span class="status-pill" style="background:${s.bg};color:${s.color}">
              <span class="sdot" style="background:${s.dot}"></span>${s.label}
             </span>
             ${rel ? `<span class="meta-sep">·</span><span class="acard-time">${rel}</span>` : ''}`
          : `<span class="badge-inactive"><i class="fa-solid fa-power-off" style="font-size:9px"></i> Inactivo</span>`
        }
      </div>
    </div>
    <div class="acard-hdr-right">
      <label class="toggle-wrap" title="${enabled ? 'Bot activo — clic para inactivar' : 'Bot inactivo — clic para activar'}">
        <input type="checkbox" class="toggle-input" ${enabled ? 'checked' : ''} onchange="toggleBot('${esc(autoId)}', this.checked)">
        <span class="toggle-track"><span class="toggle-thumb"></span></span>
        <span class="toggle-lbl">${enabled ? 'Activo' : 'Inactivo'}</span>
      </label>
      <button class="btn-send-now" id="btnSend-${esc(autoId)}"
        onclick="openSendNow('${esc(autoId)}','${esc(auto.displayName)}')"
        ${enabled ? '' : 'disabled'}>
        <i class="fa-solid fa-paper-plane"></i> Enviar ahora
      </button>
    </div>
  </div>

  <div class="tabs-bar">
    <button class="tab active" onclick="switchTab('${esc(autoId)}','run',this)">
      <i class="fa-solid fa-square-check"></i> Ejecución
    </button>
    <button class="tab" onclick="switchTab('${esc(autoId)}','cfg',this)">
      <i class="fa-solid fa-gear"></i> Configuración
    </button>
    <button class="tab" onclick="switchTab('${esc(autoId)}','hist',this)">
      <i class="fa-solid fa-clock-rotate-left"></i> Historial
    </button>
  </div>

  <div id="${esc(autoId)}-run" class="tab-panel">
    ${lastRun ? `
    <div class="status-banner" style="background:${s.bg};border-color:${s.dot}20">
      <div class="status-banner-left">
        <div class="status-icon-wrap" style="background:${s.dot}20">
          <i class="${s.icon}" style="font-size:18px;color:${s.dot}"></i>
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
        <i class="fa-solid fa-circle-exclamation" style="color:#b91c1c"></i>
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
      <i class="fa-regular fa-clock" style="font-size:36px;color:#d3d3d9"></i>
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

  <div id="${esc(autoId)}-hist" class="tab-panel" style="display:none">
    <div class="hist-toolbar">
      <select class="hist-select" id="histMonth-${esc(autoId)}" onchange="renderHistTable('${esc(autoId)}')">
        <option value="">Todos los meses</option>
      </select>
      <span class="hist-count" id="histCount-${esc(autoId)}"></span>
    </div>
    <div id="hist-chart-${esc(autoId)}" class="hist-chart-wrap" style="display:none"></div>
    <div id="histBody-${esc(autoId)}">
      <div class="hist-empty">
        <i class="fa-solid fa-clock-rotate-left" style="font-size:36px;color:#e6e6ea"></i>
        <p>Cargando historial...</p>
      </div>
    </div>
  </div>

  <div id="${esc(autoId)}-cfg" class="tab-panel" style="display:none">
    <div class="cfg-grid" id="cfg-${esc(autoId)}">
      <div class="cfg-loading">Cargando configuración...</div>
    </div>
    <div class="cfg-actions">
      <button class="btn-save" id="btnSave-${esc(autoId)}" onclick="saveConfig('${esc(clientId)}','${esc(autoId)}')">
        <i class="fa-solid fa-floppy-disk"></i> Guardar cambios
      </button>
      <button class="btn-reload" onclick="loadConfig('${esc(clientId)}','${esc(autoId)}')">
        <i class="fa-solid fa-arrows-rotate"></i> Recargar
      </button>
    </div>
  </div>

</section>`;
}

function renderDashboard(user, client, lastRuns, opts = {}) {
  const isAdminView = opts.isAdminView || false;
  const viewClientId = opts.viewClientId || user.clientId;
  const version = opts.version || null;
  const enabledStates = opts.enabledStates || {};
  const deployStr = version ? formatDeploy(version.deployDate) : '';
  const cards = Object.entries(client.automations)
    .map(([id, auto]) => renderCard(viewClientId, id, auto, lastRuns[id] || null, isAdminView, enabledStates[id] !== false))
    .join('\n');

  const automationTypes = Object.fromEntries(
    Object.entries(client.automations).map(([id, a]) => [id, a.type || 'file'])
  );

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
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css">
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    html{scroll-behavior:smooth}
    body{font-family:'Segoe UI',system-ui,-apple-system,sans-serif;background:#f4f4f5;color:#23232f;min-height:100vh}

    /* ─── Header ─── */
    .hdr{background:#08070e;height:56px;display:flex;align-items:center;padding:0 24px;position:sticky;top:0;z-index:50;border-bottom:1px solid rgba(255,255,255,.05)}
    .hdr-left{display:flex;align-items:center;gap:12px;flex:1;min-width:0}
    .logo-mark{width:32px;height:32px;background:linear-gradient(135deg,#3d3d4b,#51515d);border-radius:8px;display:flex;align-items:center;justify-content:center;flex-shrink:0}
    .logo-mark i{font-size:14px;color:#f9f9fb}
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
    .acard-disabled{opacity:.6;filter:grayscale(.35)}
    .acard-hdr{padding:16px 22px;border-bottom:1px solid #f4f4f5;display:flex;align-items:center;justify-content:space-between;gap:12px}
    .acard-hdr-info{display:flex;flex-direction:column;gap:6px}
    .acard-hdr-right{display:flex;align-items:center;gap:10px;flex-shrink:0}

    /* ─── Toggle switch ─── */
    .toggle-wrap{display:inline-flex;align-items:center;gap:7px;cursor:pointer;user-select:none}
    .toggle-input{display:none}
    .toggle-track{width:36px;height:20px;background:#d3d3d9;border-radius:999px;position:relative;transition:background .2s;flex-shrink:0}
    .toggle-input:checked + .toggle-track{background:#22c55e}
    .toggle-thumb{position:absolute;top:2px;left:2px;width:16px;height:16px;background:#fff;border-radius:50%;transition:transform .2s;box-shadow:0 1px 3px rgba(8,7,14,.2)}
    .toggle-input:checked + .toggle-track .toggle-thumb{transform:translateX(16px)}
    .toggle-lbl{font-size:11px;font-weight:600;color:#71707b;min-width:42px}
    .badge-inactive{display:inline-flex;align-items:center;gap:5px;padding:3px 10px;border-radius:999px;background:#f4f4f5;color:#a1a1aa;font-size:11px;font-weight:600}
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
    .hist-empty p{font-size:13px}
    .hist-err-tip{font-size:11px;color:#a1a1aa;max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;cursor:help}
    .btn-retry{display:inline-flex;align-items:center;gap:4px;padding:5px 10px;background:#fff5f5;color:#b91c1c;border:1px solid #fecaca;border-radius:6px;font-size:11px;font-weight:600;cursor:pointer;transition:all .15s;white-space:nowrap}
    .btn-retry:hover{background:#fee2e2;border-color:#fca5a5}
    .btn-retry:disabled{background:#f4f4f5;color:#a1a1aa;border-color:#e6e6ea;cursor:not-allowed}
    .spin-sm{display:inline-block;width:11px;height:11px;border:1.5px solid #fecaca;border-top-color:#b91c1c;border-radius:50%;animation:spin .7s linear infinite}

    /* ─── History chart ─── */
    .hist-chart-wrap{border:1px solid #e6e6ea;border-radius:9px;overflow:hidden;background:#fff;padding:8px 4px;margin-bottom:14px}

    /* ─── SweetAlert2 overrides ─── */
    .swal2-popup{font-family:'Segoe UI',system-ui,-apple-system,sans-serif!important;border-radius:14px!important}
    .swal2-title{font-size:15px!important;font-weight:600!important;color:#171622!important;padding-top:20px!important}
    .swal2-html-container{font-size:13px!important;color:#51515d!important}
    .swal2-cancel{background:#f4f4f5!important;color:#51515d!important;border:1px solid #e6e6ea!important}
    .swal2-validation-message{font-size:12px!important;border-radius:7px!important}
    .swal2-actions{gap:8px!important}

    /* ─── MFA Banner ─── */
    .mfa-banner{display:none;position:fixed;bottom:24px;right:24px;background:#fff;border:2px solid #f59e0b;border-radius:14px;padding:20px 22px;box-shadow:0 8px 30px rgba(8,7,14,.18);z-index:999;min-width:320px;max-width:380px;animation:mfa-in .25s ease}
    @keyframes mfa-in{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
    .mfa-banner-hdr{display:flex;align-items:center;gap:10px;margin-bottom:10px}
    .mfa-banner-hdr i{color:#f59e0b;font-size:20px;flex-shrink:0}
    .mfa-banner-hdr strong{font-size:14px;color:#171622}
    .mfa-banner-desc{font-size:12px;color:#71707b;margin-bottom:14px;line-height:1.5}
    .mfa-input-row{display:flex;gap:8px}
    .mfa-input{flex:1;padding:9px 13px;border:1.5px solid #e6e6ea;border-radius:8px;font-size:14px;outline:none;transition:border-color .2s;letter-spacing:2px;font-family:'Consolas','Menlo',monospace}
    .mfa-input:focus{border-color:#f59e0b;box-shadow:0 0 0 3px rgba(245,158,11,.12)}
    .mfa-submit{padding:9px 16px;background:#f59e0b;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:13px;font-weight:600;transition:all .15s;white-space:nowrap;flex-shrink:0}
    .mfa-submit:hover{background:#d97706}
    .mfa-submit:disabled{background:#d3d3d9;cursor:not-allowed}
    .mfa-feedback{margin-top:8px;font-size:12px;min-height:16px}

    @keyframes spin{to{transform:rotate(360deg)}}
    @media(max-width:600px){.metrics-grid{grid-template-columns:1fr 1fr}.status-banner{flex-direction:column;align-items:flex-start}}
  </style>
</head>
<body>

<header class="hdr">
  <div class="hdr-left">
    <div class="logo-mark"><i class="fa-solid fa-bolt"></i></div>
    <span class="logo-name">Kubot</span>
    <span class="bc-sep">/</span>
    <span class="bc-client">${esc(client.displayName)}</span>
    <div class="global-dot" title="Estado general"></div>
  </div>
  <div class="hdr-right">
    ${version ? `<span class="hdr-version" title="Commit ${esc(version.commit)} — Deploy ${esc(deployStr)}">${esc(version.version)}${deployStr ? ` · ${esc(deployStr)}` : ''}</span>` : ''}
    ${isAdminView
      ? `<a href="/admin" class="btn-back"><i class="fa-solid fa-arrow-left"></i> Volver al admin</a>`
      : `<span class="hdr-user">${esc(user.username)}</span>
         <form method="POST" action="/logout" style="margin:0"><button class="btn-logout" type="submit">Salir</button></form>`
    }
  </div>
</header>

<main class="page">
  ${cards}
</main>

<div id="mfa-banner" class="mfa-banner">
  <div class="mfa-banner-hdr">
    <i class="fa-solid fa-shield-halved"></i>
    <strong>MiBanco requiere código MFA</strong>
  </div>
  <p class="mfa-banner-desc">El bot está en pausa esperando tu código de verificación. Ingrésalo abajo y el proceso continuará automáticamente.</p>
  <div class="mfa-input-row">
    <input id="mfa-code-input" class="mfa-input" type="text" placeholder="Código OTP" maxlength="8" autocomplete="one-time-code" inputmode="numeric" />
    <button id="mfa-submit-btn" class="mfa-submit" onclick="submitMfaCode()">Enviar</button>
  </div>
  <div id="mfa-feedback" class="mfa-feedback"></div>
</div>

<script src="https://cdn.jsdelivr.net/npm/apexcharts/dist/apexcharts.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/sweetalert2@11/dist/sweetalert2.all.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/notiflix@3.2.8/dist/notiflix-aio-3.2.8.min.js"></script>
<script>
const CID = '${esc(viewClientId)}';
const IS_ADMIN = ${isAdminView};
const AUTOMATION_TYPES = ${JSON.stringify(automationTypes)};

function esc(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

Notiflix.Notify.init({
  position: 'right-bottom',
  timeout: 3200,
  borderRadius: '10px',
  fontSize: '13px',
  fontFamily: "'Segoe UI',system-ui,-apple-system,sans-serif",
  width: '300px',
  clickToClose: true,
});

const _histCache = {};
const _apexCharts = {};

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

function renderHistChart(autoId, rows) {
  const el = document.getElementById('hist-chart-'+autoId);
  if (!el) return;
  if (rows.length === 0) { el.style.display = 'none'; return; }
  el.style.display = '';

  if (_apexCharts[autoId]) { _apexCharts[autoId].destroy(); delete _apexCharts[autoId]; }

  const byDate = {};
  rows.forEach(h => {
    if (!h.timestamp) return;
    const date = h.timestamp.slice(0, 10);
    if (!byDate[date]) byDate[date] = { ok: 0, err: 0 };
    h.status === 'ok' ? byDate[date].ok++ : byDate[date].err++;
  });

  const dates = Object.keys(byDate).sort();
  const chart = new ApexCharts(el, {
    series: [
      { name: 'Exitoso', data: dates.map(d => byDate[d].ok) },
      { name: 'Error',   data: dates.map(d => byDate[d].err) },
    ],
    chart: {
      type: 'bar', height: 120, stacked: true,
      toolbar: { show: false },
      animations: { enabled: true, speed: 300 },
      fontFamily: "'Segoe UI',system-ui,sans-serif",
    },
    colors: ['#22c55e', '#ef4444'],
    xaxis: {
      categories: dates,
      labels: { style: { fontSize: '10px', colors: '#a1a1aa' } },
      axisBorder: { show: false }, axisTicks: { show: false },
    },
    yaxis: { show: false },
    legend: { show: true, position: 'top', fontSize: '11px', labels: { colors: '#71707b' } },
    plotOptions: { bar: { columnWidth: '55%', borderRadius: 2 } },
    dataLabels: { enabled: false },
    grid: { borderColor: '#f4f4f5', strokeDashArray: 3, padding: { left: 4, right: 4 } },
    tooltip: { theme: 'light', style: { fontSize: '12px' } },
  });
  chart.render();
  _apexCharts[autoId] = chart;
}

function renderHistTable(autoId) {
  const history = _histCache[autoId] || [];
  const month = document.getElementById('histMonth-'+autoId).value;
  const rows = month ? history.filter(h => h.timestamp && h.timestamp.startsWith(month)) : history;
  const countEl = document.getElementById('histCount-'+autoId);
  countEl.textContent = rows.length + ' ejecuci' + (rows.length === 1 ? 'ón' : 'ones');

  renderHistChart(autoId, rows);

  if (!rows.length) {
    document.getElementById('histBody-'+autoId).innerHTML = '<div class="hist-empty"><i class="fa-solid fa-clock-rotate-left" style="font-size:32px;color:#e6e6ea"></i><p>Sin ejecuciones para este período</p></div>';
    return;
  }

  const fmt = ts => {
    if (!ts) return '—';
    const d = new Date(ts);
    return d.toLocaleDateString('es-PE',{day:'2-digit',month:'2-digit',year:'numeric'}) + ' ' +
           d.toLocaleTimeString('es-PE',{hour:'2-digit',minute:'2-digit'});
  };

  const isIngesta = AUTOMATION_TYPES[autoId] === 'ingesta';

  if (isIngesta) {
    document.getElementById('histBody-'+autoId).innerHTML = \`<table class="hist-table">
      <thead><tr>
        <th>Fecha ejecución</th><th>Estado</th><th>F. procesada</th><th>Registros</th><th>Duración</th><th>Detalle</th><th>Acción</th>
      </tr></thead>
      <tbody>\${rows.map(h => \`
        <tr>
          <td style="white-space:nowrap;color:#51515d">\${fmt(h.timestamp)}</td>
          <td>\${h.status==='ok'
            ? '<span class="hst-ok"><span class="hst-dot" style="background:#22c55e"></span>OK</span>'
            : '<span class="hst-err"><span class="hst-dot" style="background:#ef4444"></span>Error</span>'}</td>
          <td style="white-space:nowrap;font-size:12px;color:#51515d">\${esc(h.fechaReporte||'—')}</td>
          <td style="white-space:nowrap;font-size:12px">
            \${h.registrosValidos != null
              ? \`<span style="font-weight:600;color:#171622">\${esc(String(h.registrosValidos))}</span>\${h.totalRegistros != null ? \` <span style="color:#a1a1aa;font-size:11px">/ \${esc(String(h.totalRegistros))}</span>\` : ''}\`
              : '—'}
          </td>
          <td style="white-space:nowrap">\${esc(h.duracion||'—')}</td>
          <td>\${h.error ? \`<span class="hist-err-tip" title="\${esc(h.error)}">\${esc(h.error)}</span>\`
            : (h.fase === 'completado' ? '<span style="font-size:11px;color:#a1a1aa">Completado</span>' : '—')}</td>
          <td>\${h.status !== 'ok' ? \`<button class="btn-retry" onclick="resendFailed('\${esc(autoId)}', this)"><i class="fa-solid fa-rotate-right"></i> Reintentar</button>\` : '<span style="font-size:11px;color:#d3d3d9">—</span>'}</td>
        </tr>\`).join('')}
      </tbody>
    </table>\`;
  } else {
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
          <td>\${h.status !== 'ok' ? \`<button class="btn-retry" onclick="resendFailed('\${esc(autoId)}', this)"><i class="fa-solid fa-rotate-right"></i> Reenviar</button>\` : '<span style="font-size:11px;color:#d3d3d9">—</span>'}</td>
        </tr>\`).join('')}
      </tbody>
    </table>\`;
  }
}

async function resendFailed(autoId, btn) {
  const { isConfirmed } = await Swal.fire({
    title: '¿Reintentar ahora?',
    text: 'Se ejecutará la automatización de inmediato.',
    icon: 'question',
    showCancelButton: true,
    confirmButtonText: 'Sí, reintentar',
    cancelButtonText: 'Cancelar',
    confirmButtonColor: '#171622',
    reverseButtons: true,
  });
  if (!isConfirmed) return;
  const orig = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<span class="spin-sm"></span> Reintentando...';
  try {
    const r = await fetch('/api/clients/'+CID+'/automations/'+autoId+'/rerun', { method: 'POST' });
    const d = await r.json();
    if (d.summary?.status === 'ok') {
      Notiflix.Notify.success('Reintento exitoso');
    } else {
      const err = d.summary?.error || d.error || 'Error desconocido';
      Notiflix.Notify.failure('Falló: ' + err);
    }
    delete _histCache[autoId];
    await loadHistory(CID, autoId);
  } catch {
    Notiflix.Notify.failure('Error de conexión');
    btn.disabled = false;
    btn.innerHTML = orig;
  }
}

function openSendNow(autoId, displayName) {
  Swal.fire({
    title: 'Enviar ahora',
    html: '<p style="font-size:13px;color:#51515d;margin-bottom:14px"><strong style="color:#171622">' + esc(displayName) + '</strong> se ejecutará inmediatamente.</p>' +
          '<label class="send-chk">' +
          '<input type="checkbox" id="swal-skip-chk">' +
          '<span>' +
          '<span class="send-chk-text">Cancelar la ejecución programada de hoy</span>' +
          '<span class="send-chk-hint">Si no marcas esto, el envío programado del día también se ejecutará a su horario.</span>' +
          '</span></label>',
    showCancelButton: true,
    confirmButtonText: '<i class="fa-solid fa-paper-plane"></i> Ejecutar ahora',
    cancelButtonText: 'Cancelar',
    confirmButtonColor: '#171622',
    reverseButtons: true,
    preConfirm: () => document.getElementById('swal-skip-chk')?.checked || false,
  }).then(result => {
    if (result.isConfirmed) runNow(CID, autoId, result.value);
  });
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
      Notiflix.Notify.success(autoId + ' completado' + (skipSchedule ? ' — programado cancelado' : ''));
      if (res) res.innerHTML = '<div class="result-ok"><i class="fa-solid fa-check" style="color:#15803d"></i> Exitoso · ' + esc(d.summary.duracion||'') + '</div>';
    } else {
      const err = d.summary?.error || d.error || 'Error desconocido';
      Notiflix.Notify.failure('Error en ' + autoId);
      if (res) {
        res.innerHTML = '<div class="result-err"><strong>Error:</strong> ' + esc(err) + '</div>';
        if (d.stdout) res.innerHTML += '<pre class="log-pre">'+esc(d.stdout)+'</pre>';
      }
    }
  } catch(e) { Notiflix.Notify.failure('Error de conexión'); }
  finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Enviar ahora'; }
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
        \${f.hint?\`<span class="fld-hint">\${esc(f.hint)}</span>\`:''}
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

// ─── MFA banner ────────────────────────────────────────────────────────────
let _mfaPolling = null;
function startMfaPoll() {
  if (_mfaPolling) return;
  _mfaPolling = setInterval(async () => {
    try {
      const r = await fetch('/api/mfa/mibanco');
      const data = await r.json();
      const banner = document.getElementById('mfa-banner');
      if (data.status === 'waiting') {
        banner.style.display = 'block';
      } else if (data.status !== 'waiting') {
        banner.style.display = 'none';
        document.getElementById('mfa-code-input').value = '';
        document.getElementById('mfa-feedback').textContent = '';
        document.getElementById('mfa-submit-btn').disabled = false;
      }
    } catch {}
  }, 3000);
}
async function submitMfaCode() {
  const input = document.getElementById('mfa-code-input');
  const btn = document.getElementById('mfa-submit-btn');
  const fb = document.getElementById('mfa-feedback');
  const code = input.value.trim();
  if (!code) { fb.style.color = '#b91c1c'; fb.textContent = 'Ingresa el código'; return; }
  btn.disabled = true;
  fb.style.color = '#71707b';
  fb.textContent = 'Enviando...';
  try {
    const r = await fetch('/api/mfa/mibanco', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    });
    if (r.ok) {
      fb.style.color = '#15803d';
      fb.textContent = '✓ Código enviado — el bot continuará en breve';
    } else {
      fb.style.color = '#b91c1c';
      fb.textContent = 'Error al enviar';
      btn.disabled = false;
    }
  } catch {
    fb.style.color = '#b91c1c';
    fb.textContent = 'Error de conexión';
    btn.disabled = false;
  }
}
document.getElementById('mfa-code-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') submitMfaCode();
});
startMfaPoll();

async function toggleBot(autoId, enabled) {
  const card = document.getElementById('card-'+autoId);
  try {
    const r = await fetch('/api/clients/'+CID+'/automations/'+autoId+'/toggle', {
      method: 'PUT',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ enabled }),
    });
    if (!r.ok) throw new Error('server');
    Notiflix.Notify.success(enabled ? autoId + ' activado' : autoId + ' inactivado');
    card.dataset.enabled = enabled;
    card.classList.toggle('acard-disabled', !enabled);
    const lbl = card.querySelector('.toggle-lbl');
    if (lbl) lbl.textContent = enabled ? 'Activo' : 'Inactivo';
    const chk = card.querySelector('.toggle-input');
    if (chk) chk.title = enabled ? 'Bot activo — clic para inactivar' : 'Bot inactivo — clic para activar';
    const btn = document.getElementById('btnSend-'+autoId);
    if (btn) btn.disabled = !enabled;
    const meta = card.querySelector('.acard-meta');
    if (meta) {
      if (enabled) {
        meta.innerHTML = meta.innerHTML.replace(/<span class="badge-inactive">.*?<\/span>/s, '');
      } else {
        if (!meta.querySelector('.badge-inactive')) {
          meta.innerHTML = '<span class="badge-inactive"><i class="fa-solid fa-power-off" style="font-size:9px"></i> Inactivo</span>';
        }
      }
    }
  } catch {
    Notiflix.Notify.failure('Error al cambiar estado');
    const chk = card.querySelector('.toggle-input');
    if (chk) chk.checked = !enabled;
  }
}

function saveConfig(clientId, autoId) {
  Swal.fire({
    title: 'Confirmar cambios',
    html: '<p style="font-size:12px;color:#71707b;margin:0 0 12px">Ingresa tus credenciales para guardar la configuración</p>' +
          '<input id="swal-user" class="swal2-input" placeholder="Usuario" autocomplete="username" style="margin-bottom:8px">' +
          '<input id="swal-pass" class="swal2-input" type="password" placeholder="Contraseña" autocomplete="current-password">',
    showCancelButton: true,
    confirmButtonText: '<i class="fa-solid fa-floppy-disk"></i> Guardar',
    cancelButtonText: 'Cancelar',
    confirmButtonColor: '#171622',
    reverseButtons: true,
    focusConfirm: false,
    didOpen: () => {
      document.getElementById('swal-user').focus();
      document.getElementById('swal-pass').addEventListener('keydown', e => {
        if (e.key === 'Enter') Swal.clickConfirm();
      });
    },
    preConfirm: async () => {
      const username = document.getElementById('swal-user').value.trim();
      const password = document.getElementById('swal-pass').value;
      if (!username || !password) {
        Swal.showValidationMessage('Completa usuario y contraseña');
        return false;
      }
      try {
        const auth = await fetch('/api/auth/login', {
          method: 'POST', headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({ username, password }),
        });
        if (!auth.ok) { Swal.showValidationMessage('Usuario o contraseña incorrectos'); return false; }
        return true;
      } catch { Swal.showValidationMessage('Error de conexión'); return false; }
    },
  }).then(async result => {
    if (!result.isConfirmed) return;
    const updates = {};
    document.querySelectorAll('#cfg-'+autoId+' input').forEach(i => { updates[i.name] = i.value; });
    try {
      const r = await fetch('/api/clients/'+clientId+'/automations/'+autoId+'/config', {
        method: 'PUT', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ updates }),
      });
      r.ok ? Notiflix.Notify.success('Configuración guardada') : Notiflix.Notify.failure('Error al guardar');
    } catch { Notiflix.Notify.failure('Error de conexión'); }
  });
}
</script>
</body>
</html>`;
}

module.exports = { renderDashboard };
