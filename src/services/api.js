const TOKEN_KEY = 'heeva_auth_token';

export const getAuthToken = () => {
  if (typeof window !== 'undefined' && window.localStorage) {
    return window.localStorage.getItem(TOKEN_KEY);
  }
  return null;
};

export const setAuthToken = (token) => {
  if (typeof window !== 'undefined' && window.localStorage) {
    if (token) {
      window.localStorage.setItem(TOKEN_KEY, token);
    } else {
      window.localStorage.removeItem(TOKEN_KEY);
    }
  }
};

export const clearAuthToken = () => setAuthToken(null);

const getBaseUrl = () => {
  if (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_URL) {
    return import.meta.env.VITE_API_URL.replace(/\/+$/, '') + '/api';
  }
  // Node / test runner environment: always use absolute Worker URL
  if (typeof process !== 'undefined' && process.versions?.node) {
    const port = process.env?.WORKER_PORT || process.env?.PORT || 8787;
    return `http://127.0.0.1:${port}/api`;
  }
  if (typeof window !== 'undefined' && window.location?.origin) {
    return '/api';
  }
  return 'http://127.0.0.1:8787/api';
};

// In browser environments, proactively purge any legacy cached /api responses from Service Worker CacheStorage
if (typeof window !== 'undefined' && 'caches' in window) {
  window.caches.keys().then((keys) => {
    keys.forEach((k) => {
      window.caches.open(k).then((cache) => {
        cache.keys().then((requests) => {
          requests.forEach((req) => {
            try {
              if (new URL(req.url).pathname.startsWith('/api')) {
                cache.delete(req);
              }
            } catch (_) {}
          });
        });
      });
    });
  }).catch(() => {});
}

async function request(path, options = {}) {
  const base = getBaseUrl();
  const token = getAuthToken();

  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {}),
  };

  let response;
  try {
    response = await fetch(`${base}${path}`, {
      ...options,
      headers,
      cache: 'no-store', // Always bypass HTTP disk/memory cache for dynamic clinic data
    });
  } catch (error) {
    // Only log network failure if in browser runtime
    if (typeof window !== 'undefined' && !(typeof process !== 'undefined' && process.versions?.node)) {
      console.error('[API] network error', error);
    }
    throw new Error('Unable to reach the server. Start the backend with npm run dev.');
  }

  if (response.status === 401) {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('heeva:unauthorized', { detail: { path } }));
    }
  }

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const message = body.error || `Request failed (${response.status})`;
    // Do not pollute console with 404s when querying individual records
    if (response.status !== 404) {
      console.error('[API]', path, message);
    }
    const err = new Error(message);
    err.status = response.status;
    throw err;
  }

  return response.status === 204 ? null : response.json();
}

export const authApi = {
  async login(password) {
    const res = await request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ password }),
    });
    if (res && res.token) {
      setAuthToken(res.token);
    }
    return res;
  },
  async verify() {
    const token = getAuthToken();
    if (!token) return false;
    try {
      const res = await request('/auth/verify', { method: 'POST' });
      return !!(res && res.ok);
    } catch (err) {
      if (err.status === 401) {
        clearAuthToken();
      }
      return false;
    }
  },
  async logout() {
    try {
      await request('/auth/logout', { method: 'POST' });
    } catch (_) {
      // ignore
    } finally {
      clearAuthToken();
    }
  },
  getToken: getAuthToken,
  clearToken: clearAuthToken,
};

export const adminApi = {
  async resetDatabase(password) {
    return request('/admin/reset', {
      method: 'POST',
      body: JSON.stringify({ password }),
    });
  },
};

export const getHealth = () => request('/health');
export const getRecords = (table) => request(`/${table}`);
export const getRecord = async (table, id) => {
  if (!id) return null;
  try {
    return await request(`/${table}/${encodeURIComponent(id)}`);
  } catch (error) {
    if (error.status === 404 || /404|Record not found|not found/i.test(error.message)) {
      return null;
    }
    throw error;
  }
};
export const createRecord = (table, record) =>
  request(`/${table}`, { method: 'POST', body: JSON.stringify(record) });
export const updateRecord = (table, id, patch) =>
  request(`/${table}/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(patch) });
export const deleteRecord = (table, id) =>
  request(`/${table}/${encodeURIComponent(id)}`, { method: 'DELETE' });

export const bulkImportRecords = (table, records, userId = null) =>
  request(`/${table}/import`, { method: 'POST', body: JSON.stringify({ records, userId }) });

export const getPatients = () => getRecords('patients');
export const createPatient = (patient) => createRecord('patients', patient);
export const updatePatient = (id, patch) => updateRecord('patients', id, patch);
export const deletePatient = (id) => deleteRecord('patients', id);
export const getMedicines = () => getRecords('medicines');
export const createMedicine = (medicine) => createRecord('medicines', medicine);
export const updateMedicine = (id, patch) => updateRecord('medicines', id, patch);
export const deleteMedicine = (id) => deleteRecord('medicines', id);
export const getAppointments = () => getRecords('appointments');
export const createAppointment = (appointment) => createRecord('appointments', appointment);
export const updateAppointment = (id, patch) => updateRecord('appointments', id, patch);
export const deleteAppointment = (id) => deleteRecord('appointments', id);
