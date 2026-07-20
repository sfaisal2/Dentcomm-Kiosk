const express = require("express");
const patients = require("../data/patients");
const settings = require("../config/settings");
const { calculateProgress, getTransferReadiness, isPastNoShowWindow } = require("../services/patientStateService");

const router = express.Router();

// Spec §5.1: "Status badges: Forms complete / Forms partial / Insurance
// verified / Insurance pending / Needs attention."
function withBadges(patient) {
  calculateProgress(patient);

  const homeFormsComplete = !!(
    patient.forms?.medicalHistory?.completed &&
    patient.forms?.healthQuestionnaire?.completed &&
    patient.forms?.hipaaAcknowledgment?.completed
  );
  const consentComplete = !!(patient.consentSignatures?.financialPolicy && patient.consentSignatures?.treatmentConsent);
  const formsStatus = homeFormsComplete && consentComplete ? "complete" : "partial";

  const insuranceStatus = ["verified", "previously_verified"].includes(patient.dentverify?.status)
    ? "verified"
    : patient.dentverify?.status === "pending"
    ? "pending"
    : "not_started";

  const needsAttention =
    isPastNoShowWindow(patient, settings) ||
    !!patient.kioskData?.idScan?.needsStaffReview ||
    !!patient.kioskData?.insuranceScan?.needsStaffReview ||
    patient.dentverify?.status === "failed" ||
    patient.dentverify?.status === "requires_reverification";

  return {
    ...patient,
    badges: { formsStatus, insuranceStatus, needsAttention },
    transferReadiness: getTransferReadiness(patient)
  };
}

// Spec §10.2: GET /dentcomm/dashboard/pre-arrival?date=today. Accepts
// "today", a YYYY-MM-DD date, or "all" to skip date filtering entirely.
// Spec §5.1 scopes the inbox to "the current day", so today is the default.
function matchesDate(patient, dateParam) {
  if (dateParam === "all") return true;
  const target = !dateParam || dateParam === "today" ? new Date() : new Date(`${dateParam}T00:00:00`);
  if (Number.isNaN(target.getTime())) return true;
  const appt = new Date(patient.appointmentTime);
  return (
    appt.getFullYear() === target.getFullYear() &&
    appt.getMonth() === target.getMonth() &&
    appt.getDate() === target.getDate()
  );
}

router.get("/pre-arrival", (req, res) => {
  const preArrivalPatients = patients
    .filter((patient) => ["pre_arrival", "kiosk_in_progress", "ready_to_transfer", "reactivated"].includes(patient.status))
    .filter((patient) => matchesDate(patient, req.query.date))
    .map(withBadges);

  res.json(preArrivalPatients);
});

router.get("/no-show-archive", (req, res) => {
  res.json(patients.filter((patient) => patient.status === "no_show" && !patient.archived).map(withBadges));
});

module.exports = router;
