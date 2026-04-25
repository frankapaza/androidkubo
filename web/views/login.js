function renderLogin(error) {
  const errorMsg =
    error === 'token_invalido' ? 'El enlace de acceso es inválido o ya expiró.' :
    error ? 'Usuario o contraseña incorrectos.' : '';

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Kubot — Acceso</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    html,body{height:100%}
    body{font-family:'Segoe UI',system-ui,-apple-system,sans-serif;background:#08070e;display:flex;align-items:stretch;min-height:100vh}

    /* Left panel */
    .left{flex:1;display:flex;flex-direction:column;justify-content:space-between;padding:40px;background:linear-gradient(135deg,#08070e 0%,#171622 60%,#23232f 100%);position:relative;overflow:hidden}
    .left::before{content:'';position:absolute;inset:0;background:radial-gradient(ellipse at 30% 50%,rgba(61,61,75,.35) 0%,transparent 70%);pointer-events:none}
    .brand{display:flex;align-items:center;gap:12px;position:relative}
    .brand-icon{width:38px;height:38px;background:linear-gradient(135deg,#3d3d4b,#51515d);border-radius:10px;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 12px rgba(0,0,0,.4)}
    .brand-icon svg{width:18px;height:18px;fill:#f9f9fb}
    .brand-name{font-size:18px;font-weight:700;color:#f9f9fb;letter-spacing:-.3px}
    .hero{position:relative}
    .hero h1{font-size:36px;font-weight:800;color:#f9f9fb;line-height:1.15;letter-spacing:-.6px;margin-bottom:16px}
    .hero h1 span{color:#71707b}
    .hero p{font-size:15px;color:#71707b;line-height:1.6;max-width:380px}
    .features{display:flex;flex-direction:column;gap:12px;position:relative}
    .feat{display:flex;align-items:center;gap:12px}
    .feat-dot{width:6px;height:6px;border-radius:50%;background:#3d3d4b;flex-shrink:0}
    .feat span{font-size:13px;color:#51515d}

    /* Right panel */
    .right{width:420px;background:#f9f9fb;display:flex;align-items:center;justify-content:center;padding:40px 48px;flex-shrink:0}
    .form-wrap{width:100%}
    .form-title{font-size:22px;font-weight:700;color:#171622;letter-spacing:-.4px;margin-bottom:4px}
    .form-sub{font-size:13px;color:#71707b;margin-bottom:28px}
    .error-box{background:#fff5f5;border:1px solid #fecaca;color:#b91c1c;padding:11px 14px;border-radius:9px;font-size:13px;margin-bottom:20px;display:flex;align-items:center;gap:8px}
    .error-box svg{width:15px;height:15px;fill:#ef4444;flex-shrink:0}
    .field{margin-bottom:18px}
    label{display:block;font-size:12px;font-weight:600;color:#51515d;letter-spacing:.3px;margin-bottom:7px}
    .input-wrap{position:relative}
    input{width:100%;padding:11px 14px;border:1.5px solid #e6e6ea;border-radius:9px;font-size:14px;color:#171622;outline:none;background:#fff;transition:border-color .2s,box-shadow .2s}
    input:focus{border-color:#3d3d4b;box-shadow:0 0 0 3px rgba(61,61,75,.10)}
    input::placeholder{color:#a1a1aa}
    .submit-btn{width:100%;padding:12px;background:#171622;color:#f9f9fb;border:none;border-radius:9px;font-size:14px;font-weight:600;cursor:pointer;transition:background .2s,transform .1s;letter-spacing:.1px;display:flex;align-items:center;justify-content:center;gap:8px;margin-top:6px}
    .submit-btn:hover{background:#08070e}
    .submit-btn:active{transform:scale(.99)}
    .submit-btn:disabled{background:#d3d3d9;cursor:not-allowed;transform:none}
    .divider{display:flex;align-items:center;gap:12px;margin:20px 0}
    .divider-line{flex:1;height:1px;background:#e6e6ea}
    .divider-text{font-size:11px;color:#a1a1aa;font-weight:500}

    /* Responsive */
    @media(max-width:700px){
      .left{display:none}
      .right{width:100%;padding:32px 24px}
    }
  </style>
</head>
<body>
<div class="left">
  <div class="brand">
    <div class="brand-icon"><svg viewBox="0 0 24 24"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg></div>
    <span class="brand-name">Kubot</span>
  </div>
  <div class="hero">
    <h1>Automatizaciones<br><span>inteligentes</span></h1>
    <p>Panel centralizado para monitorear, ejecutar y configurar tus automatizaciones de negocio.</p>
  </div>
  <div class="features">
    <div class="feat"><div class="feat-dot"></div><span>Descarga y envío automático de reportes</span></div>
    <div class="feat"><div class="feat-dot"></div><span>Historial de ejecuciones en tiempo real</span></div>
    <div class="feat"><div class="feat-dot"></div><span>Reenvío manual en caso de errores</span></div>
    <div class="feat"><div class="feat-dot"></div><span>Configuración sin tocar código</span></div>
  </div>
</div>

<div class="right">
  <div class="form-wrap">
    <div class="form-title">Bienvenido</div>
    <div class="form-sub">Ingresa tus credenciales para continuar</div>

    ${errorMsg ? `<div class="error-box"><svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>${errorMsg}</div>` : ''}

    <form id="loginForm">
      <div class="field">
        <label for="u">Usuario</label>
        <input type="text" id="u" autocomplete="username" required autofocus placeholder="tu_usuario">
      </div>
      <div class="field">
        <label for="p">Contraseña</label>
        <input type="password" id="p" autocomplete="current-password" required placeholder="••••••••">
      </div>
      <button type="submit" class="submit-btn" id="btn">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M11 7L9.6 8.4l2.6 2.6H2v2h10.2l-2.6 2.6L11 17l5-5-5-5zm9 12h-8v2h8c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2h-8v2h8v14z"/></svg>
        Ingresar
      </button>
    </form>
  </div>
</div>

<script>
  document.getElementById('loginForm').addEventListener('submit', async e => {
    e.preventDefault();
    const btn = document.getElementById('btn');
    btn.disabled = true;
    btn.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" style="animation:spin .7s linear infinite"><path d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46C19.54 15.03 20 13.57 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74C4.46 8.97 4 10.43 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z"/></svg> Ingresando...';
    try {
      const r = await fetch('/api/auth/login', {
        method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ username: document.getElementById('u').value, password: document.getElementById('p').value }),
      });
      if (r.ok) {
        const { token, role } = await r.json();
        document.cookie = 'token=' + token + ';path=/;max-age=28800;samesite=strict';
        window.location.href = role === 'admin' ? '/admin' : '/dashboard';
      } else {
        window.location.href = '/login?error=credenciales';
      }
    } catch { window.location.href = '/login?error=credenciales'; }
  });
</script>
<style>@keyframes spin{to{transform:rotate(360deg)}}</style>
</body>
</html>`;
}

module.exports = { renderLogin };
