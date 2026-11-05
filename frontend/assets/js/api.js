(function (root) {
  const MESSAGES = {
    401: 'Tu sesión expiró. Ingresa de nuevo.',
    403: 'No tienes permiso para esta acción.',
    404: 'No encontramos lo que buscas.',
    429: 'Demasiados intentos. Espera unos minutos.',
  };

  class ApiError extends Error {
    constructor(status, code, message, detail) {
      super(message);
      this.status = status;
      this.code = code;
      this.detail = detail || {};
    }

    get userMessage() {
      if (this.status === 400 && this.detail.fields && this.detail.fields.length) {
        return 'Revisa los datos: ' + this.detail.fields.map((f) => f.field).filter(Boolean).join(', ');
      }
      if (this.status === 409 || this.status === 422 || this.status === 400) return this.message;
      if (MESSAGES[this.status]) return this.status === 403 && this.code === 'PASSWORD_CHANGE_REQUIRED' ? this.message : MESSAGES[this.status];
      if (this.status === 0) return 'No hay conexión con el servidor.';
      const ref = this.detail.correlationId ? ` (ref. ${this.detail.correlationId})` : '';
      return 'El servicio no está disponible. Intenta de nuevo.' + ref;
    }
  }

  const state = { csrf: null, user: null, onUnauthenticated: null };

  function clearSession() {
    state.csrf = null;
    state.user = null;
  }

  async function request(method, path, options = {}) {
    const headers = { Accept: 'application/json', ...(options.headers || {}) };
    const init = { method, credentials: 'same-origin', headers };
    if (options.body !== undefined) {
      init.body = JSON.stringify(options.body);
      headers['Content-Type'] = 'application/json';
    }
    if (state.csrf && method !== 'GET') headers['X-CSRF-Token'] = state.csrf;
    let response;
    try {
      response = await fetch('/api/v1' + path + (options.query ? '?' + new URLSearchParams(options.query) : ''), init);
    } catch (_) {
      throw new ApiError(0, 'NETWORK', 'Sin conexión');
    }
    const data = response.status === 204 ? null : await response.json().catch(() => null);
    if (!response.ok) {
      const detail = (data && data.error) || {};
      const error = new ApiError(response.status, detail.code, detail.message || 'Error', detail);
      if (response.status === 401) {
        clearSession();
        if (state.onUnauthenticated) state.onUnauthenticated(error);
      }
      throw error;
    }
    return data;
  }

  const api = {
    state,
    ApiError,
    get: (path, query) => request('GET', path, { query }),
    post: (path, body, headers) => request('POST', path, { body: body === undefined ? {} : body, headers }),
    put: (path, body) => request('PUT', path, { body }),
    delete: (path) => request('DELETE', path),

    async login(email, password) {
      const data = await request('POST', '/auth/login', { body: { email, password } });
      state.csrf = data.csrfToken;
      state.user = { ...data.user, mustChangePassword: data.mustChangePassword };
      return state.user;
    },

    async session() {
      try {
        const data = await request('GET', '/auth/session');
        state.csrf = data.csrfToken;
        state.user = { ...data.user, mustChangePassword: data.mustChangePassword };
        return state.user;
      } catch (error) {
        if (error.status === 401) return null;
        throw error;
      }
    },

    async logout() {
      try {
        await request('POST', '/auth/logout');
      } catch (error) {
        if (error.status !== 401) throw error;
      } finally {
        clearSession();
      }
    },

    async graphql(operationName, query, variables) {
      const data = await request('POST', '/graphql', { body: { operationName, query, variables: variables || {} } });
      return data;
    },

    idempotencyKey: () => (root.crypto && root.crypto.randomUUID ? root.crypto.randomUUID().replace(/-/g, '') : String(Date.now()) + Math.random().toString(16).slice(2)),
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.API = api;
})(typeof window !== 'undefined' ? window : globalThis);
