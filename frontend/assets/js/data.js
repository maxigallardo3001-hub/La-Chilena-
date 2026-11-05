const CART_PREFIX = 'lachilena_cart_';

function cartKey(userId) {
  return CART_PREFIX + (userId || 'anon');
}

function getCart(userId) {
  if (!userId) return {};
  try {
    const raw = localStorage.getItem(cartKey(userId));
    return raw ? JSON.parse(raw) : {};
  } catch (_) {
    return {};
  }
}

function saveCart(userId, cart) {
  if (!userId) return;
  try {
    localStorage.setItem(cartKey(userId), JSON.stringify(cart));
  } catch (_) {}
}

function clearCart(userId) {
  if (!userId) return;
  try {
    localStorage.removeItem(cartKey(userId));
  } catch (_) {}
}

function fmtCLP(n) {
  return '$' + Number(n || 0).toLocaleString('es-CL');
}

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('es-CL', {
    day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit'
  });
}

function esc(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function validRun(run) {
  const m = /^(\d{1,2})\.(\d{3})\.(\d{3})-([\dkK])$/.exec(String(run || '').trim());
  if (!m) return false;
  const digits = m[1] + m[2] + m[3];
  const factors = [2, 3, 4, 5, 6, 7, 2, 3, 4, 5, 6, 7];
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    sum += Number(digits[digits.length - 1 - i]) * factors[i];
  }
  const rem = 11 - (sum % 11);
  const expected = rem === 11 ? '0' : rem === 10 ? 'K' : String(rem);
  return m[4].toUpperCase() === expected;
}

const CAT_LABEL = {
  horno: 'Horno',
  frita: 'Frita',
  bebida: 'Bebida',
};

const STATUS_LABEL = {
  pendiente_pago: { label: 'Pago pendiente', cls: 'pending' },
  pagado: { label: 'Pago confirmado', cls: 'ready' },
  en_preparacion: { label: 'En preparación', cls: 'ready' },
  despachado: { label: 'Despachado', cls: 'ready' },
  entregado: { label: 'Entregado', cls: 'delivered' },
  anulado: { label: 'Anulado', cls: 'cancelled' },
  PENDIENTE_PAGO: { label: 'Pago pendiente', cls: 'pending' },
  PAGADO: { label: 'Pago confirmado', cls: 'ready' },
  EN_PREPARACION: { label: 'En preparación', cls: 'ready' },
  DESPACHADO: { label: 'Despachado', cls: 'ready' },
  ENTREGADO: { label: 'Entregado', cls: 'delivered' },
  ANULADO: { label: 'Anulado', cls: 'cancelled' },
};

function statusInfo(status) {
  return STATUS_LABEL[status] || { label: String(status || ''), cls: 'pending' };
}

function renderPager(container, page, size, total, onChange) {
  const pages = Math.max(1, Math.ceil(total / size));
  if (pages <= 1) {
    container.innerHTML = '';
    return;
  }
  container.innerHTML = `
    <button class="btn btn-ghost btn-sm" data-page="${page - 1}" ${page <= 1 ? 'disabled' : ''}>Anterior</button>
    <span style="font-size:13px; color:var(--ink-soft);">Página ${page} de ${pages} · ${total} pedidos</span>
    <button class="btn btn-ghost btn-sm" data-page="${page + 1}" ${page >= pages ? 'disabled' : ''}>Siguiente</button>`;
  container.querySelectorAll('[data-page]').forEach((btn) => {
    btn.addEventListener('click', () => onChange(Number(btn.dataset.page)));
  });
}
