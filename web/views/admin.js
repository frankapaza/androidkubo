function esc(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function initials(username) {
  return username.slice(0,2).toUpperCase();
}

function avatarColor(username) {
  const colors = ['#3d3d4b','#51515d','#23232f','#4a4a5a','#2d2d3a'];
  let h = 0; for(const c of username) h = (h*31+c.charCodeAt(0))%colors.length;
  return colors[h];
}

function renderAdmin(adminUser, clientOptions) {
  const clientOptsHtml = clientOptions.map(([id, name]) =>
    `<option value="${esc(id)}">${esc(name)}</option>`
  ).join('');

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Kubot — Administración</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    html{scroll-behavior:smooth}
    body{font-family:'Segoe UI',system-ui,-apple-system,sans-serif;background:#f4f4f5;color:#23232f;min-height:100vh}

    /* ─── Header ─── */
    .hdr{background:#08070e;height:56px;display:flex;align-items:center;padding:0 24px;position:sticky;top:0;z-index:50;border-bottom:1px solid rgba(255,255,255,.06)}
    .hdr-left{display:flex;align-items:center;gap:12px;flex:1}
    .logo-mark{width:32px;height:32px;background:linear-gradient(135deg,#3d3d4b,#51515d);border-radius:8px;display:flex;align-items:center;justify-content:center;flex-shrink:0}
    .logo-mark svg{width:16px;height:16px;fill:#f9f9fb}
    .logo-name{font-size:15px;font-weight:700;color:#f9f9fb;letter-spacing:-.3px}
    .breadcrumb{display:flex;align-items:center;gap:6px;margin-left:4px}
    .bc-sep{color:#3d3d4b;font-size:16px}
    .bc-pill{font-size:11px;font-weight:600;background:#23232f;color:#71707b;padding:3px 10px;border-radius:999px;letter-spacing:.4px;text-transform:uppercase}
    .hdr-right{display:flex;align-items:center;gap:10px}
    .hdr-avatar{width:30px;height:30px;border-radius:8px;background:#23232f;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:#71707b;letter-spacing:.5px}
    .hdr-user{font-size:12px;color:#51515d;font-weight:500}
    .btn-logout{background:transparent;border:1px solid #23232f;color:#51515d;padding:5px 12px;border-radius:7px;cursor:pointer;font-size:12px;font-weight:500;transition:all .15s}
    .btn-logout:hover{border-color:#3d3d4b;color:#a1a1aa}

    /* ─── Layout ─── */
    .page{max-width:960px;margin:0 auto;padding:28px 20px;display:grid;gap:20px}

    /* ─── Stats bar ─── */
    .stats{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}
    .stat{background:#fff;border:1px solid #e6e6ea;border-radius:11px;padding:16px 20px;display:flex;align-items:center;gap:14px}
    .stat-icon{width:38px;height:38px;border-radius:9px;display:flex;align-items:center;justify-content:center;flex-shrink:0}
    .stat-icon svg{width:18px;height:18px}
    .stat-val{font-size:22px;font-weight:700;color:#171622;line-height:1}
    .stat-lbl{font-size:12px;color:#71707b;margin-top:3px}

    /* ─── Card ─── */
    .card{background:#fff;border:1px solid #e6e6ea;border-radius:12px;overflow:hidden}
    .card-hdr{padding:16px 22px;border-bottom:1px solid #f4f4f5;display:flex;align-items:center;justify-content:space-between}
    .card-hdr-left{display:flex;flex-direction:column;gap:2px}
    .card-title{font-size:14px;font-weight:600;color:#171622}
    .card-sub{font-size:12px;color:#a1a1aa}
    .card-body{padding:22px}

    /* ─── Form ─── */
    .form-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}
    @media(max-width:580px){.form-grid{grid-template-columns:1fr}}
    .fld{display:flex;flex-direction:column;gap:6px}
    .fld label{font-size:11px;font-weight:600;color:#71707b;text-transform:uppercase;letter-spacing:.5px}
    .fld input,.fld select{padding:10px 13px;border:1.5px solid #e6e6ea;border-radius:8px;font-size:13px;color:#23232f;outline:none;background:#fff;transition:border-color .2s,box-shadow .2s;-webkit-appearance:none}
    .fld input:focus,.fld select:focus{border-color:#3d3d4b;box-shadow:0 0 0 3px rgba(61,61,75,.09)}
    .fld input::placeholder{color:#a1a1aa}
    .form-actions{margin-top:18px;padding-top:18px;border-top:1px solid #f4f4f5;display:flex;align-items:center;gap:10px}

    /* ─── Table ─── */
    .tbl-wrap{overflow-x:auto}
    table{width:100%;border-collapse:collapse}
    thead tr{background:#f9f9fb}
    th{padding:11px 18px;text-align:left;font-size:11px;font-weight:600;color:#a1a1aa;text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid #e6e6ea;white-space:nowrap}
    td{padding:13px 18px;border-bottom:1px solid #f4f4f5;font-size:13px;color:#23232f;vertical-align:middle}
    tr:last-child td{border-bottom:none}
    tbody tr:hover td{background:#f9f9fb;transition:background .1s}
    .user-cell{display:flex;align-items:center;gap:10px}
    .avatar{width:32px;height:32px;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:#f9f9fb;flex-shrink:0;letter-spacing:.5px}
    .user-name{font-weight:500;color:#171622}
    .user-id{font-size:11px;color:#a1a1aa;font-family:'Consolas','Menlo',monospace;margin-top:1px}
    .client-chip{display:inline-flex;align-items:center;gap:5px;padding:3px 10px;background:#f4f4f5;border:1px solid #e6e6ea;border-radius:6px;font-size:12px;color:#51515d;font-family:'Consolas','Menlo',monospace}
    .role-pill{display:inline-block;padding:3px 10px;border-radius:999px;font-size:11px;font-weight:600;letter-spacing:.2px}
    .role-admin{background:#fef3c7;color:#92400e}
    .role-client{background:#ede9fe;color:#4c1d95}
    .actions-cell{display:flex;gap:6px;align-items:center;flex-wrap:wrap}
    .no-client{color:#d3d3d9;font-size:12px;font-style:italic}

    /* ─── Buttons ─── */
    .btn{display:inline-flex;align-items:center;gap:5px;padding:7px 13px;border-radius:7px;font-size:12px;font-weight:500;border:none;cursor:pointer;transition:all .15s;white-space:nowrap;text-decoration:none}
    .btn svg{width:13px;height:13px;flex-shrink:0}
    .btn-primary{background:#171622;color:#f9f9fb}
    .btn-primary:hover{background:#08070e}
    .btn-primary:disabled{background:#d3d3d9;color:#a1a1aa;cursor:not-allowed}
    .btn-ghost{background:#f4f4f5;color:#51515d;border:1px solid #e6e6ea}
    .btn-ghost:hover{background:#e6e6ea;color:#23232f}
    .btn-view{background:#ede9fe;color:#4c1d95;border:1px solid #ddd6fe}
    .btn-view:hover{background:#ddd6fe}
    .btn-warn{background:#fef3c7;color:#92400e;border:1px solid #fde68a}
    .btn-warn:hover{background:#fde68a}
    .btn-danger{background:#fff5f5;color:#b91c1c;border:1px solid #fecaca}
    .btn-danger:hover{background:#fee2e2}

    /* ─── Empty ─── */
    .empty-state{display:flex;flex-direction:column;align-items:center;justify-content:center;padding:48px 24px;gap:12px}
    .empty-state svg{width:40px;height:40px;fill:#e6e6ea}
    .empty-state p{font-size:13px;color:#a1a1aa;text-align:center}

    /* ─── Modal ─── */
    .overlay{display:none;position:fixed;inset:0;background:rgba(8,7,14,.55);z-index:100;align-items:center;justify-content:center;padding:20px;backdrop-filter:blur(2px)}
    .overlay.open{display:flex;animation:fadeIn .15s ease}
    @keyframes fadeIn{from{opacity:0}to{opacity:1}}
    .modal{background:#fff;border-radius:14px;width:100%;max-width:400px;box-shadow:0 20px 60px rgba(8,7,14,.3);animation:slideUp .2s ease}
    @keyframes slideUp{from{transform:translateY(12px);opacity:0}to{transform:translateY(0);opacity:1}}
    .modal-hdr{padding:20px 22px 0;display:flex;align-items:flex-start;justify-content:space-between}
    .modal-hdr h3{font-size:16px;font-weight:600;color:#171622}
    .modal-hdr p{font-size:13px;color:#71707b;margin-top:4px}
    .btn-close{background:none;border:none;cursor:pointer;padding:2px;color:#a1a1aa;transition:color .15s;margin-left:12px;flex-shrink:0}
    .btn-close:hover{color:#23232f}
    .btn-close svg{width:18px;height:18px;fill:currentColor}
    .modal-body{padding:18px 22px}
    .modal-footer{padding:0 22px 20px;display:flex;gap:8px;justify-content:flex-end}

    /* ─── Toast ─── */
    .toast{position:fixed;bottom:28px;right:28px;padding:12px 18px;border-radius:10px;font-size:13px;font-weight:500;z-index:999;box-shadow:0 8px 28px rgba(8,7,14,.25);display:none;align-items:center;gap:8px;max-width:320px}
    .toast.show{display:flex;animation:slideUp .2s ease}
    .tok-ok{background:#171622;color:#f9f9fb}
    .tok-err{background:#ef4444;color:#fff}
    .tok-ok svg{fill:#4ade80}
    .tok-err svg{fill:#fff}
  </style>
</head>
<body>

<header class="hdr">
  <div class="hdr-left">
    <div class="logo-mark"><svg viewBox="0 0 24 24"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg></div>
    <span class="logo-name">Kubot</span>
    <div class="breadcrumb">
      <span class="bc-sep">/</span>
      <span class="bc-pill">Administración</span>
    </div>
  </div>
  <div class="hdr-right">
    <div class="hdr-avatar">${esc(initials(adminUser.username))}</div>
    <span class="hdr-user">${esc(adminUser.username)}</span>
    <form method="POST" action="/logout" style="margin:0">
      <button class="btn-logout" type="submit">Salir</button>
    </form>
  </div>
</header>

<main class="page">

  <!-- Stats -->
  <div class="stats" id="statsRow">
    <div class="stat">
      <div class="stat-icon" style="background:#f4f4f5"><svg viewBox="0 0 24 24" fill="#71707b"><path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/></svg></div>
      <div><div class="stat-val" id="statTotal">—</div><div class="stat-lbl">Usuarios totales</div></div>
    </div>
    <div class="stat">
      <div class="stat-icon" style="background:#ede9fe"><svg viewBox="0 0 24 24" fill="#7c3aed"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z"/></svg></div>
      <div><div class="stat-val" id="statAdmins">—</div><div class="stat-lbl">Administradores</div></div>
    </div>
    <div class="stat">
      <div class="stat-icon" style="background:#f0fdf4"><svg viewBox="0 0 24 24" fill="#16a34a"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg></div>
      <div><div class="stat-val" id="statClients">—</div><div class="stat-lbl">Clientes activos</div></div>
    </div>
  </div>

  <!-- Crear usuario -->
  <div class="card">
    <div class="card-hdr">
      <div class="card-hdr-left">
        <span class="card-title">Nuevo usuario</span>
        <span class="card-sub">Asigna un cliente y rol al nuevo acceso</span>
      </div>
    </div>
    <div class="card-body">
      <div class="form-grid">
        <div class="fld">
          <label>Usuario</label>
          <input type="text" id="nu" placeholder="nombre_usuario" autocomplete="off">
        </div>
        <div class="fld">
          <label>Contraseña</label>
          <input type="password" id="np" placeholder="Mínimo 8 caracteres" autocomplete="new-password">
        </div>
        <div class="fld">
          <label>Cliente</label>
          <select id="nc">
            <option value="">— Sin cliente (solo admin) —</option>
            ${clientOptsHtml}
          </select>
        </div>
        <div class="fld">
          <label>Rol</label>
          <select id="nr">
            <option value="client">Cliente</option>
            <option value="admin">Administrador</option>
          </select>
        </div>
      </div>
      <div class="form-actions">
        <button class="btn btn-primary" id="btnCreate" onclick="createUser()">
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
          Crear usuario
        </button>
        <span id="createMsg" style="font-size:12px;color:#a1a1aa"></span>
      </div>
    </div>
  </div>

  <!-- Lista de usuarios -->
  <div class="card">
    <div class="card-hdr">
      <div class="card-hdr-left">
        <span class="card-title">Usuarios registrados</span>
        <span class="card-sub">Gestiona accesos y contraseñas</span>
      </div>
      <button class="btn btn-ghost" onclick="loadUsers()" style="font-size:12px;padding:6px 12px">
        <svg viewBox="0 0 24 24" fill="currentColor" width="13" height="13"><path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/></svg>
        Actualizar
      </button>
    </div>
    <div class="tbl-wrap" id="usersTable">
      <div class="empty-state">
        <svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>
        <p>Cargando usuarios...</p>
      </div>
    </div>
  </div>

</main>

<!-- Modal: Cambiar clave -->
<div class="overlay" id="pwdOverlay">
  <div class="modal">
    <div class="modal-hdr">
      <div>
        <h3>Cambiar contraseña</h3>
        <p>Usuario: <strong id="pwdUser" style="color:#171622"></strong></p>
      </div>
      <button class="btn-close" onclick="closeModal('pwdOverlay')"><svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg></button>
    </div>
    <div class="modal-body">
      <div class="fld">
        <label>Nueva contraseña</label>
        <input type="password" id="pwdInput" placeholder="Nueva contraseña segura" autocomplete="new-password">
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="closeModal('pwdOverlay')">Cancelar</button>
      <button class="btn btn-primary" onclick="savePassword()">
        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M17 3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V7l-4-4zm-5 16c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3zm3-10H5V5h10v4z"/></svg>
        Guardar
      </button>
    </div>
  </div>
</div>

<!-- Modal: Confirmar eliminar -->
<div class="overlay" id="delOverlay">
  <div class="modal">
    <div class="modal-hdr">
      <div>
        <h3>Eliminar usuario</h3>
        <p>Esta acción no se puede deshacer.</p>
      </div>
      <button class="btn-close" onclick="closeModal('delOverlay')"><svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg></button>
    </div>
    <div class="modal-body">
      <p style="font-size:14px;color:#51515d;line-height:1.6">¿Confirmas eliminar al usuario <strong id="delUser" style="color:#171622"></strong>? Se perderá su acceso inmediatamente.</p>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="closeModal('delOverlay')">Cancelar</button>
      <button class="btn btn-danger" onclick="confirmDelete()" style="background:#ef4444;color:#fff;border:none">
        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
        Eliminar
      </button>
    </div>
  </div>
</div>

<div id="toast" class="toast"></div>

<script>
let _pwdTarget = null, _delTarget = null;

function esc(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

function toast(msg, ok=true) {
  const t = document.getElementById('toast');
  t.className = 'toast show ' + (ok ? 'tok-ok' : 'tok-err');
  t.innerHTML = (ok
    ? '<svg width="16" height="16" viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>'
    : '<svg width="16" height="16" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>'
  ) + esc(msg);
  clearTimeout(t._t);
  t._t = setTimeout(() => { t.className = 'toast'; }, 3200);
}

function openModal(id) { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }
document.querySelectorAll('.overlay').forEach(o =>
  o.addEventListener('click', e => { if(e.target === o) o.classList.remove('open'); })
);

function avatarStyle(username) {
  const colors = ['#3d3d4b','#51515d','#23232f','#4a4a5a','#2d2d3a'];
  let h = 0; for(const c of username) h = (h*31+c.charCodeAt(0))%colors.length;
  return colors[h];
}

async function loadUsers() {
  const el = document.getElementById('usersTable');
  try {
    const {users} = await (await fetch('/api/admin/users')).json();

    // Update stats
    document.getElementById('statTotal').textContent = users.length;
    document.getElementById('statAdmins').textContent = users.filter(u=>u.role==='admin').length;
    document.getElementById('statClients').textContent = users.filter(u=>u.role==='client'&&u.clientId).length;

    if (!users.length) {
      el.innerHTML = \`<div class="empty-state"><svg viewBox="0 0 24 24"><path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/></svg><p>No hay usuarios registrados aún.</p></div>\`;
      return;
    }

    el.innerHTML = \`<table>
      <thead><tr>
        <th>Usuario</th><th>Cliente</th><th>Rol</th><th>Acciones</th>
      </tr></thead>
      <tbody>\${users.map(u => \`
        <tr>
          <td>
            <div class="user-cell">
              <div class="avatar" style="background:\${avatarStyle(u.username)}">\${esc(u.username.slice(0,2).toUpperCase())}</div>
              <div><div class="user-name">\${esc(u.username)}</div></div>
            </div>
          </td>
          <td>\${u.clientId ? \`<span class="client-chip">\${esc(u.clientId)}</span>\` : '<span class="no-client">sin cliente</span>'}</td>
          <td><span class="role-pill role-\${esc(u.role||'client')}">\${esc(u.role||'client')}</span></td>
          <td>
            <div class="actions-cell">
              \${u.clientId ? \`<a href="/admin/view/\${esc(u.clientId)}" class="btn btn-view" target="_blank"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/></svg>Ver</a>\` : ''}
              <button class="btn btn-warn" onclick="openPwd('\${esc(u.username)}')"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zM12 17c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1s3.1 1.39 3.1 3.1v2z"/></svg>Clave</button>
              \${u.role !== 'admin' ? \`<button class="btn btn-danger" onclick="openDel('\${esc(u.username)}')"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>Eliminar</button>\` : ''}
            </div>
          </td>
        </tr>\`).join('')}
      </tbody>
    </table>\`;
  } catch {
    el.innerHTML = '<div class="empty-state"><p style="color:#ef4444">Error al cargar usuarios</p></div>';
  }
}

async function createUser() {
  const username = document.getElementById('nu').value.trim();
  const password = document.getElementById('np').value;
  const clientId = document.getElementById('nc').value;
  const role = document.getElementById('nr').value;
  const msg = document.getElementById('createMsg');
  if (!username || !password) { toast('Completa usuario y contraseña', false); return; }
  const btn = document.getElementById('btnCreate');
  btn.disabled = true; btn.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor" style="animation:spin .7s linear infinite"><path d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46C19.54 15.03 20 13.57 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74C4.46 8.97 4 10.43 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z"/></svg> Creando...';
  try {
    const r = await fetch('/api/admin/users', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ username, password, clientId: clientId||null, role }),
    });
    const d = await r.json();
    if (r.ok) {
      toast('✓ Usuario "' + username + '" creado');
      document.getElementById('nu').value = '';
      document.getElementById('np').value = '';
      loadUsers();
    } else { toast(d.error || 'Error al crear', false); }
  } catch { toast('Error de conexión', false); }
  finally {
    btn.disabled = false;
    btn.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg> Crear usuario';
  }
}

function openPwd(username) {
  _pwdTarget = username;
  document.getElementById('pwdUser').textContent = username;
  document.getElementById('pwdInput').value = '';
  openModal('pwdOverlay');
  setTimeout(() => document.getElementById('pwdInput').focus(), 150);
}

async function savePassword() {
  const password = document.getElementById('pwdInput').value;
  if (!password) { toast('Escribe la nueva contraseña', false); return; }
  try {
    const r = await fetch('/api/admin/users/' + _pwdTarget + '/password', {
      method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify({password}),
    });
    r.ok ? (toast('✓ Contraseña actualizada'), closeModal('pwdOverlay')) : toast('Error al actualizar', false);
  } catch { toast('Error de conexión', false); }
}

function openDel(username) {
  _delTarget = username;
  document.getElementById('delUser').textContent = username;
  openModal('delOverlay');
}

async function confirmDelete() {
  try {
    const r = await fetch('/api/admin/users/' + _delTarget, { method:'DELETE' });
    r.ok ? (toast('Usuario eliminado'), closeModal('delOverlay'), loadUsers()) : toast('Error al eliminar', false);
  } catch { toast('Error de conexión', false); }
}

loadUsers();
</script>
<style>@keyframes spin{to{transform:rotate(360deg)}}</style>
</body>
</html>`;
}

module.exports = { renderAdmin };
