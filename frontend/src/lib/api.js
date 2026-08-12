export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:5000";

// Stand-in for a real staff login (spec §2.1 distinguishes a staff session
// from a kiosk session) — a fixed dev token until real auth lands. Must
// match backend/middleware/auth.js's STAFF_TOKEN.
const STAFF_TOKEN = import.meta.env.VITE_STAFF_AUTH_TOKEN || "dev-staff-token";

let kioskSessionToken = null;

export function setKioskSessionToken(token) {
  kioskSessionToken = token;
}

async function request(path, options = {}, auth = null) {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };

  if (auth === "staff") {
    headers.Authorization = `Bearer ${STAFF_TOKEN}`;
  } else if (auth === "kiosk") {
    if (!kioskSessionToken) throw new Error("Kiosk session not established yet.");
    headers.Authorization = `Bearer ${kioskSessionToken}`;
  }

  const response = await fetch(`${API_BASE_URL}${path}`, { headers, ...options });

  const data = await response.json();
  if (!response.ok) {
    const error = new Error(data.error || data.message || "Request failed");
    if (data.blockers) error.blockers = data.blockers;
    throw error;
  }
  return data;
}

// Spec §2.1: the kiosk device authenticates as a scoped kiosk session, not a
// staff session. Called once when the kiosk view mounts, before any lookup.
export async function startKioskSession() {
  const data = await request("/dentcomm/kiosk/session", { method: "POST", body: JSON.stringify({}) });
  setKioskSessionToken(data.token);
  return data;
}

export function lookupPatient(payload) {
  return request("/dentcomm/kiosk/lookup", { method: "POST", body: JSON.stringify(payload) }, "kiosk");
}

export function getPreArrivalPatients() {
  return request("/dentcomm/dashboard/pre-arrival", {}, "staff");
}

export function getNoShowArchive() {
  return request("/dentcomm/dashboard/no-show-archive", {}, "staff");
}

export function getPatient(id) {
  return request(`/dentcomm/patients/${id}`, {}, "staff");
}

export function scanId(patientId, imageBase64) {
  return request(`/dentcomm/kiosk/${patientId}/id-scan`, { method: "POST", body: JSON.stringify({ imageBase64 }) }, "kiosk");
}

export function scanInsurance(patientId, frontImageBase64, backImageBase64) {
  return request(
    `/dentcomm/kiosk/${patientId}/insurance-scan`,
    { method: "POST", body: JSON.stringify({ frontImageBase64, backImageBase64 }) },
    "kiosk"
  );
}

export function submitInsuranceManually(patientId, payload) {
  return request(`/dentcomm/kiosk/${patientId}/insurance-manual`, { method: "POST", body: JSON.stringify(payload) }, "kiosk");
}

export function confirmAddress(patientId, payload) {
  return request(`/dentcomm/kiosk/${patientId}/address`, { method: "PATCH", body: JSON.stringify(payload) }, "kiosk");
}

// Staff-triggered (spec Screen 5), not part of the kiosk session — see
// backend/routes/kiosk.js's comment on this route.
export function captureSignature(patientId, formType, pdfBase64) {
  return request(
    `/dentcomm/kiosk/${patientId}/signature`,
    { method: "POST", body: JSON.stringify({ formType, pdfBase64 }) },
    "staff"
  );
}

export function verifyInsurance(dentcommRecordId) {
  return request(
    "/dentverify/verify",
    { method: "POST", body: JSON.stringify({ dentcommRecordId, preArrival: true }) },
    "staff"
  );
}

export function checkInPatient(patientId) {
  return request(`/dentcomm/patients/${patientId}/checkin`, { method: "POST" }, "staff");
}

export function markNoShow(patientId) {
  return request(`/dentcomm/patients/${patientId}/status/no-show`, { method: "PATCH" }, "staff");
}

export function reactivatePatient(patientId) {
  return request(`/dentcomm/patients/${patientId}/reactivate`, { method: "POST" }, "staff");
}

export function followUpPatient(patientId, note) {
  return request(`/dentcomm/patients/${patientId}/follow-up`, { method: "POST", body: JSON.stringify({ note }) }, "staff");
}

export function archivePatient(patientId) {
  return request(`/dentcomm/patients/${patientId}/archive`, { method: "POST" }, "staff");
}

export function completeForm(patientId, formType) {
  return request(`/dentcomm/kiosk/${patientId}/forms/${formType}/complete`, { method: "POST" }, "kiosk");
}

export function getSettings() {
  return request("/dentcomm/settings");
}

export function updateSettings(updates) {
  return request("/dentcomm/settings", { method: "PATCH", body: JSON.stringify(updates) }, "staff");
}
