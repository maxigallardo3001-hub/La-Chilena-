const ROLE_HOME = {
  cliente: 'index.html',
  administrador: 'admin-productos.html',
  cajero: 'ventas.html',
  despacho: 'despacho.html',
  dueno: 'reportes.html',
};

const ROLE_LABEL = {
  cliente: 'Cliente',
  administrador: 'Administrador',
  cajero: 'Cajero virtual',
  despacho: 'Encargado de despacho',
  dueno: 'Dueño',
};

function getSession() {
  return API.state.user;
}

function iniciales(nombre) {
  return (nombre || '?').split(' ').filter(Boolean).map(p => p[0]).slice(0, 2).join('').toUpperCase();
}

function cartItemCount() {
  const session = getSession();
  if (!session || session.role !== 'cliente') return 0;
  const cart = getCart(session.id);
  return Object.values(cart).reduce((a, b) => a + b, 0);
}

async function logout() {
  try {
    await API.logout();
  } catch (_) {}
  location.href = 'login.html';
}

let toastTimer;
function showToast(msg) {
  let t = document.getElementById('toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'toast';
    t.className = 'toast';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
}

function ensurePasswordModal() {
  let modal = document.getElementById('pwd-modal-overlay');
  if (modal) return modal;
  modal = document.createElement('div');
  modal.id = 'pwd-modal-overlay';
  modal.className = 'win-modal-overlay';
  modal.style.zIndex = '1100';
  modal.innerHTML = `
    <div class="win-modal" style="width:420px;">
      <div class="win-modal-header">
        <span id="pwd-modal-title">Cambiar contraseña</span>
        <button type="button" class="win-modal-close" id="pwd-modal-close">&times;</button>
      </div>
      <div class="win-modal-body">
        <p id="pwd-modal-hint" style="font-size:13px; color:var(--ink-soft); margin:0 0 12px 0;">
          Ingresa tu contraseña actual y define una nueva de al menos 8 caracteres.
        </p>
        <div id="pwd-modal-error" class="mensaje-error" style="margin-bottom:12px;">
          <p id="pwd-modal-error-msg" class="detalle-error"></p>
        </div>
        <form id="pwdChangeForm">
          <div class="field" style="margin-bottom:12px;">
            <label>Contraseña actual</label>
            <input type="password" id="pwdCurrent" required autocomplete="current-password">
          </div>
          <div class="field" style="margin-bottom:12px;">
            <label>Nueva contraseña</label>
            <input type="password" id="pwdNew" required minlength="8" autocomplete="new-password" placeholder="Mínimo 8 caracteres">
          </div>
          <div class="field" style="margin-bottom:4px;">
            <label>Confirmar nueva contraseña</label>
            <input type="password" id="pwdConfirm" required minlength="8" autocomplete="new-password" placeholder="Repite la nueva contraseña">
          </div>
          <button type="submit" style="display:none;"></button>
        </form>
      </div>
      <div class="win-modal-footer" style="display:flex; justify-content:flex-end; gap:8px;">
        <button type="button" class="win-btn" id="pwd-modal-cancel">Cancelar</button>
        <button type="button" class="win-btn win-btn-primary" id="pwd-modal-submit">Guardar contraseña</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  return modal;
}

function openPasswordModal(mandatory, onCompleted) {
  const modal = ensurePasswordModal();
  const closeBtn = document.getElementById('pwd-modal-close');
  const cancelBtn = document.getElementById('pwd-modal-cancel');
  const submitBtn = document.getElementById('pwd-modal-submit');
  const form = document.getElementById('pwdChangeForm');
  const hint = document.getElementById('pwd-modal-hint');
  const errBox = document.getElementById('pwd-modal-error');
  const errMsg = document.getElementById('pwd-modal-error-msg');

  errBox.style.display = 'none';
  form.reset();
  closeBtn.style.display = mandatory ? 'none' : 'inline-block';
  cancelBtn.style.display = mandatory ? 'none' : 'inline-flex';
  hint.textContent = mandatory
    ? 'Por seguridad debes cambiar tu contraseña temporal antes de continuar.'
    : 'Ingresa tu contraseña actual y define una nueva de al menos 8 caracteres.';
  modal.style.display = 'flex';

  const close = () => {
    if (!mandatory) modal.style.display = 'none';
  };
  closeBtn.onclick = close;
  cancelBtn.onclick = close;
  submitBtn.onclick = () => form.requestSubmit();

  form.onsubmit = async (e) => {
    e.preventDefault();
    errBox.style.display = 'none';
    const currentPassword = document.getElementById('pwdCurrent').value;
    const newPassword = document.getElementById('pwdNew').value;
    const confirmPassword = document.getElementById('pwdConfirm').value;

    if (newPassword.length < 8) {
      errBox.style.display = 'block';
      errMsg.textContent = 'La nueva contraseña debe tener al menos 8 caracteres.';
      return;
    }
    if (newPassword !== confirmPassword) {
      errBox.style.display = 'block';
      errMsg.textContent = 'La confirmación no coincide con la nueva contraseña.';
      return;
    }
    if (newPassword === currentPassword) {
      errBox.style.display = 'block';
      errMsg.textContent = 'La nueva contraseña debe ser distinta de la actual.';
      return;
    }

    submitBtn.disabled = true;
    try {
      await API.post('/auth/password', { currentPassword, newPassword });
      if (API.state.user) API.state.user.mustChangePassword = false;
      modal.style.display = 'none';
      showToast('Contraseña actualizada.');
      if (typeof onCompleted === 'function') onCompleted();
    } catch (err) {
      errBox.style.display = 'block';
      errMsg.textContent = err.userMessage || err.message || 'No se pudo cambiar la contraseña.';
    } finally {
      submitBtn.disabled = false;
    }
  };
}

function renderHeader(activeView) {
  const mount = document.getElementById('app-header');
  if (!mount) return;
  const session = getSession();
  const cartCount = session && session.role === 'cliente' ? cartItemCount() : 0;

  let navLinks = '';
  let tabLinks = '';
  let accountHtml = '';

  if (!session) {
    navLinks = `
      <a href="index.html" class="${activeView === 'menu' ? 'active' : ''}">Menú</a>
      <a href="ayuda.html" class="${activeView === 'ayuda' ? 'active' : ''}">Ayuda</a>
      <a href="login.html" class="${activeView === 'login' ? 'active' : ''}">Iniciar sesión</a>`;
    accountHtml = `<a href="login.html" class="btn btn-primary btn-sm">Iniciar sesión</a>`;
  } else if (session.role === 'cliente') {
    navLinks = `
      <a href="index.html" class="${activeView === 'menu' ? 'active' : ''}">Menú</a>
      <a href="carrito.html" class="${activeView === 'cart' ? 'active' : ''}">Carrito${cartCount ? `<span class="cart-dot">${cartCount}</span>` : ''}</a>
      <a href="mis-pedidos.html" class="${activeView === 'orders' ? 'active' : ''}">Mis pedidos</a>
      <a href="ayuda.html" class="${activeView === 'ayuda' ? 'active' : ''}">Ayuda</a>`;
    tabLinks = navLinks;
    accountHtml = `
      <div class="account-box">
        <div class="avatar">${esc(iniciales(session.name))}</div>
        <span>${esc(session.name)}</span>
        <span class="logout-link" onclick="openPasswordModal(false)">Clave</span>
        <span class="logout-link" onclick="logout()">Salir</span>
      </div>`;
  } else {
    const items = {
      administrador: [
        ['admin-productos.html', 'productos', 'Productos'],
        ['admin-clientes.html', 'clientes', 'Clientes'],
        ['admin-usuarios.html', 'usuarios', 'Usuarios'],
        ['reportes.html', 'reportes', 'Reportes'],
        ['ayuda.html', 'ayuda', 'Ayuda']
      ],
      cajero: [['ventas.html', 'ventas', 'Caja'], ['ayuda.html', 'ayuda', 'Ayuda']],
      despacho: [['despacho.html', 'despacho', 'Despachos'], ['ayuda.html', 'ayuda', 'Ayuda']],
      dueno: [['reportes.html', 'reportes', 'Reportes'], ['admin-productos.html', 'productos', 'Productos'], ['ayuda.html', 'ayuda', 'Ayuda']],
    }[session.role] || [];
    navLinks = items.map(([href, key, label]) => `<a href="${href}" class="${activeView === key ? 'active' : ''}">${label}</a>`).join('');
    tabLinks = navLinks;
    accountHtml = `
      <div class="account-box">
        <div class="avatar">${esc(iniciales(session.name))}</div>
        <span>${esc(session.name)}</span>
        <span class="role-pill">${esc(ROLE_LABEL[session.role] || session.role)}</span>
        <span class="logout-link" onclick="openPasswordModal(false)">Clave</span>
        <span class="logout-link" onclick="logout()">Salir</span>
      </div>`;
  }

  mount.outerHTML = `
    <header class="topbar" id="app-header">
      <a href="${session ? (ROLE_HOME[session.role] || 'index.html') : 'index.html'}" class="brand">
        <span class="logo-script">La chilena</span>
        <small>Empanadas artesanales</small>
      </a>
      <nav class="desktop-nav">${navLinks}</nav>
      ${accountHtml}
    </header>`;

  const tabMount = document.getElementById('app-tabbar');
  if (tabMount && tabLinks) {
    tabMount.outerHTML = `<nav class="tabbar" id="app-tabbar">${tabLinks}</nav>`;
    document.body.classList.add('has-tabbar');
  } else if (tabMount && !tabLinks) {
    tabMount.innerHTML = '';
    document.body.classList.remove('has-tabbar');
  }
}

async function initSession(allowedRoles, activeView) {
  const here = location.pathname.split('/').pop() || 'index.html';
  API.state.onUnauthenticated = () => {
    if (allowedRoles && allowedRoles.length) {
      location.href = 'login.html?next=' + encodeURIComponent(here);
    }
  };
  let user = null;
  try {
    user = await API.session();
  } catch (_) {
    user = null;
  }
  if (allowedRoles && allowedRoles.length) {
    if (!user || !allowedRoles.includes(user.role)) {
      location.href = 'login.html?next=' + encodeURIComponent(here);
      return null;
    }
  }
  renderHeader(activeView);
  if (user && user.mustChangePassword) {
    await new Promise((resolve) => openPasswordModal(true, resolve));
  }
  return user;
}

const loginForm = document.getElementById('loginForm');
if (loginForm) {
  loginForm.addEventListener('submit', async function (event) {
    event.preventDefault();
    const errorBox = document.getElementById('error-box');
    const errorMessage = document.getElementById('error-message');
    errorBox.style.display = 'none';

    if (!loginForm.checkValidity()) {
      errorBox.style.display = 'block';
      errorMessage.textContent = 'Ingrese un correo válido y su contraseña.';
      return;
    }

    const emailInput = document.getElementById('email');
    const passInput = document.getElementById('pass');
    const submitBtn = loginForm.querySelector('button[type="submit"]');
    if (submitBtn) submitBtn.disabled = true;

    try {
      const user = await API.login(emailInput.value.trim(), passInput.value);
      const params = new URLSearchParams(window.location.search);
      const next = params.get('next');
      const target = next || ROLE_HOME[user.role] || 'index.html';
      if (user.mustChangePassword) {
        openPasswordModal(true, () => {
          window.location.href = target;
        });
      } else {
        window.location.href = target;
      }
    } catch (err) {
      errorBox.style.display = 'block';
      errorMessage.textContent = err.userMessage || err.message || 'Credenciales incorrectas.';
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  });
}
