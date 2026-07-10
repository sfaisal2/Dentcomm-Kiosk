const allowedTransitions = {
  pre_arrival: ["kiosk_in_progress", "no_show", "reactivated"],
  kiosk_in_progress: ["ready_to_transfer", "no_show"],
  ready_to_transfer: ["checked_in", "no_show"],
  checked_in: [],
  no_show: ["reactivated"],
  reactivated: ["pre_arrival", "kiosk_in_progress"]
};

function canTransition(currentStatus, nextStatus) {
  return allowedTransitions[currentStatus]?.includes(nextStatus) || false;
}

function updatePatientStatus(patient, nextStatus) {
  if (!canTransition(patient.status, nextStatus)) {
    throw new Error(`Cannot transition from ${patient.status} to ${nextStatus}`);
  }

  patient.status = nextStatus;
  patient.updatedAt = new Date().toISOString();
  return patient;
}

function calculateProgress(patient) {
  let progress = 0;
  if (patient.status === "pre_arrival") progress = 25;
  if (patient.kioskData?.idScan) progress = Math.max(progress, 50);
  if (patient.kioskData?.insuranceScan) progress = Math.max(progress, 75);
  if (patient.consentSignatures?.financialPolicy && patient.consentSignatures?.treatmentConsent) {
    progress = 100;
  }
  if (patient.status === "checked_in") progress = 100;
  if (patient.status === "no_show") progress = patient.progress || progress;
  patient.progress = progress;
  return progress;
}

module.exports = {
  canTransition,
  updatePatientStatus,
  calculateProgress
};
