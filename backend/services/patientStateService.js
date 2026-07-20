const allowedTransitions = {
  pre_arrival: ["kiosk_in_progress", "no_show", "reactivated"],
  kiosk_in_progress: ["ready_to_transfer", "no_show"],
  ready_to_transfer: ["checked_in", "no_show"],
  checked_in: [],
  no_show: ["reactivated"],
  reactivated: ["pre_arrival", "kiosk_in_progress"]
};

// Home-completed intake forms (spec §3 Step 2 / Screen 4). Consent forms
// (financialPolicy, treatmentConsent) are deliberately excluded here — they
// are signed at check-in, not filled from home.
const HOME_FORMS = ["medicalHistory", "healthQuestionnaire", "hipaaAcknowledgment"];

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

function homeFormsComplete(patient) {
  return HOME_FORMS.every((form) => patient.forms?.[form]?.completed);
}

// Spec §2.2 ready_to_transfer: "All required kiosk steps complete. Insurance
// verified via DentVerify." Consent signatures are NOT part of this — they are
// collected by staff at check-in (Screen 5, staff-activated), so they must not
// gate the patient reaching ready_to_transfer.
function getKioskReadiness(patient) {
  const blockers = [];

  if (!patient.kioskData?.idScan) blockers.push("Government ID scan not completed.");
  if (patient.kioskData?.idScan?.needsAddressConfirmation && !patient.kioskData?.addressOverride) {
    blockers.push("Address confirmation is still pending.");
  }
  if (!patient.kioskData?.insuranceScan) blockers.push("Insurance card scan not completed.");
  if (!["verified", "previously_verified"].includes(patient.dentverify?.status)) {
    blockers.push("DentVerify eligibility check not complete.");
  }
  if (!homeFormsComplete(patient)) blockers.push("Pre-visit forms not complete.");

  return { ready: blockers.length === 0, blockers };
}

// Full check the check-in action must satisfy: everything in getKioskReadiness
// PLUS the two consent signatures staff collect at arrival (spec §3 Step 6).
function getTransferReadiness(patient) {
  const { blockers } = getKioskReadiness(patient);

  if (!patient.consentSignatures?.financialPolicy) blockers.push("Financial policy signature not collected.");
  if (!patient.consentSignatures?.treatmentConsent) blockers.push("Treatment consent signature not collected.");

  return { ready: blockers.length === 0, blockers };
}

// Called after every kiosk/DentVerify mutation so status always reflects
// the current data instead of being set ad hoc at each call site.
function syncStatus(patient) {
  if (["checked_in", "no_show"].includes(patient.status)) return patient.status;

  if (patient.kioskData?.idScan && ["pre_arrival", "reactivated"].includes(patient.status)) {
    patient.status = "kiosk_in_progress";
  }

  const { ready } = getKioskReadiness(patient);
  if (ready && canTransition(patient.status, "ready_to_transfer")) {
    patient.status = "ready_to_transfer";
  }

  return patient.status;
}

function isPastNoShowWindow(patient, settings) {
  if (["checked_in", "no_show"].includes(patient.status)) return false;
  const apptTime = new Date(patient.appointmentTime).getTime();
  const windowMs = settings.noShowWindowHours * 60 * 60 * 1000;
  return Date.now() - apptTime > windowMs;
}

function calculateProgress(patient) {
  let progress = 10;
  if (patient.kioskData?.idScan) progress = Math.max(progress, 35);
  if (patient.kioskData?.insuranceScan) progress = Math.max(progress, 55);
  if (["verified", "previously_verified"].includes(patient.dentverify?.status)) progress = Math.max(progress, 75);
  if (homeFormsComplete(patient)) progress = Math.max(progress, 90);
  if (patient.status === "ready_to_transfer" || patient.status === "checked_in") progress = 100;
  if (patient.status === "no_show") progress = patient.progress ?? progress;

  patient.progress = progress;
  return progress;
}

module.exports = {
  canTransition,
  updatePatientStatus,
  homeFormsComplete,
  getKioskReadiness,
  getTransferReadiness,
  syncStatus,
  isPastNoShowWindow,
  calculateProgress
};
