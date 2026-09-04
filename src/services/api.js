const getBaseUrl = () => {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return '/api';
  }
  // Node / test runner fallback
  return 'http://localhost:3001/api';
};

async function request(path, options = {}) {
  const base = getBaseUrl();
  let response;
  try {
    response = await fetch(`${base}${path}`, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
    });
  } catch (error) {
    // Only log network failure if in browser runtime
    if (typeof window !== 'undefined' && !(typeof process !== 'undefined' && process.versions?.node)) {
      console.error('[API] network error', error);
    }
    throw new Error('Unable to reach the server. Start the backend with npm run dev.');
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
