const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:5000";

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options
  });

  const data = await response.json();
  if (!response.ok) {
    const error = new Error(data.error || data.message || "Request failed");
    if (data.blockers) error.blockers = data.blockers;
    throw error;
  }
  return data;
}

export function lookupPatient(payload) {
  return request("/dentcomm/kiosk/lookup", { method: "POST", body: JSON.stringify(payload) });
}

export function getPreArrivalPatients() {
  return request("/dentcomm/dashboard/pre-arrival");
}

export function getNoShowArchive() {
  return request("/dentcomm/dashboard/no-show-archive");
}

export function getPatient(id) {
  return request(`/dentcomm/patients/${id}`);
}

export function scanId(patientId, imageBase64) {
  return request(`/dentcomm/kiosk/${patientId}/id-scan`, { method: "POST", body: JSON.stringify({ imageBase64 }) });
}

export function scanInsurance(patientId, frontImageBase64, backImageBase64) {
  return request(`/dentcomm/kiosk/${patientId}/insurance-scan`, {
    method: "POST",
    body: JSON.stringify({ frontImageBase64, backImageBase64 })
  });
}

export function submitInsuranceManually(patientId, payload) {
  return request(`/dentcomm/kiosk/${patientId}/insurance-manual`, { method: "POST", body: JSON.stringify(payload) });
}

export function confirmAddress(patientId, payload) {
  return request(`/dentcomm/kiosk/${patientId}/address`, { method: "PATCH", body: JSON.stringify(payload) });
}

export function captureSignature(patientId, formType) {
  return request(`/dentcomm/kiosk/${patientId}/signature`, {
    method: "POST",
    body: JSON.stringify({ formType, signatureImageUrl: `${formType}-signature-demo` })
  });
}

export function verifyInsurance(dentcommRecordId) {
  return request("/dentverify/verify", {
    method: "POST",
    body: JSON.stringify({ dentcommRecordId, preArrival: true })
  });
}

export function checkInPatient(patientId) {
  return request(`/dentcomm/patients/${patientId}/checkin`, { method: "POST" });
}

export function markNoShow(patientId) {
  return request(`/dentcomm/patients/${patientId}/status/no-show`, { method: "PATCH" });
}

export function reactivatePatient(patientId) {
  return request(`/dentcomm/patients/${patientId}/reactivate`, { method: "POST" });
}
