const test = require('node:test');
const assert = require('node:assert');
const api = require('../frontend/assets/js/api.js');

function mockFetch(handler) {
  const calls = [];
  global.fetch = async (url, init) => {
    calls.push({ url, init });
    const { status, body } = handler(url, init);
    return { ok: status >= 200 && status < 300, status, json: async () => body };
  };
  return calls;
}

test.beforeEach(() => { api.state.csrf = null; api.state.user = null; api.state.onUnauthenticated = null; });

test('el login guarda solo el token CSRF y el usuario en memoria, y usa cookies del mismo origen', async () => {
  const calls = mockFetch(() => ({ status: 200, body: { user: { id: 'u1', name: 'Ana', role: 'cliente' }, mustChangePassword: false, csrfToken: 'tok', expiresIn: 900 } }));
  const user = await api.login('a@b.cl', 'x');
  assert.strictEqual(calls[0].init.credentials, 'same-origin');
  assert.strictEqual(user.role, 'cliente');
  assert.strictEqual(api.state.csrf, 'tok');
  assert.ok(!('token' in api.state));
});

test('el token CSRF se envía solo en los verbos que modifican datos', async () => {
  api.state.csrf = 'tok';
  const calls = mockFetch(() => ({ status: 200, body: {} }));
  await api.get('/products');
  await api.post('/orders', { items: [] });
  await api.put('/admin/products/p-1/availability', { available: false });
  await api.delete('/admin/products/p-1');
  assert.strictEqual(calls[0].init.headers['X-CSRF-Token'], undefined);
  for (const call of calls.slice(1)) assert.strictEqual(call.init.headers['X-CSRF-Token'], 'tok');
});

test('un 401 limpia el estado local y avisa a la pantalla', async () => {
  api.state.csrf = 'tok'; api.state.user = { id: 'u1' };
  let notified = null;
  api.state.onUnauthenticated = (error) => { notified = error; };
  mockFetch(() => ({ status: 401, body: { error: { code: 'UNAUTHENTICATED', message: 'x', correlationId: 'c1' } } }));
  await assert.rejects(api.get('/orders/mine'), (e) => e.status === 401);
  assert.strictEqual(api.state.csrf, null);
  assert.strictEqual(api.state.user, null);
  assert.ok(notified);
});

test('mensajes para el usuario según el estado', async () => {
  const cases = [
    [403, 'FORBIDDEN', 'No tienes permiso para esta acción.'],
    [404, 'NOT_FOUND', 'No encontramos lo que buscas.'],
    [429, 'TOO_MANY_REQUESTS', 'Demasiados intentos. Espera unos minutos.'],
  ];
  for (const [status, code, expected] of cases) {
    mockFetch(() => ({ status, body: { error: { code, message: 'interno' } } }));
    await assert.rejects(api.get('/x'), (e) => e.userMessage === expected);
  }
  mockFetch(() => ({ status: 422, body: { error: { code: 'DELIVERY_OUT_OF_ZONE', message: 'Tu comuna no tiene reparto', enabledComunas: ['Maipú'] } } }));
  await assert.rejects(api.post('/orders', {}), (e) => e.userMessage === 'Tu comuna no tiene reparto' && e.detail.enabledComunas[0] === 'Maipú');
  mockFetch(() => ({ status: 503, body: { error: { code: 'SERVICE_UNAVAILABLE', message: 'x', correlationId: 'c-77' } } }));
  await assert.rejects(api.get('/x'), (e) => e.userMessage.includes('no está disponible') && e.userMessage.includes('c-77'));
});

test('el cambio de contraseña obligatorio conserva el mensaje del servidor', async () => {
  mockFetch(() => ({ status: 403, body: { error: { code: 'PASSWORD_CHANGE_REQUIRED', message: 'Debes cambiar tu contraseña antes de continuar' } } }));
  await assert.rejects(api.get('/users'), (e) => e.userMessage === 'Debes cambiar tu contraseña antes de continuar');
});

test('session() devuelve null sin sesión y logout limpia aunque la sesión ya no exista', async () => {
  mockFetch(() => ({ status: 401, body: { error: { code: 'UNAUTHENTICATED', message: 'x' } } }));
  assert.strictEqual(await api.session(), null);
  api.state.csrf = 'tok';
  await api.logout();
  assert.strictEqual(api.state.csrf, null);
});

test('una caída de red se informa como estado 0', async () => {
  global.fetch = async () => { throw new TypeError('fetch failed'); };
  await assert.rejects(api.get('/products'), (e) => e.status === 0 && e.userMessage === 'No hay conexión con el servidor.');
});

test('las llaves de idempotencia son únicas y válidas para el gateway', () => {
  const a = api.idempotencyKey(); const b = api.idempotencyKey();
  assert.notStrictEqual(a, b);
  assert.match(a, /^[A-Za-z0-9_-]{8,64}$/);
});
