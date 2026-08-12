const express = require("express");
const patients = require("../data/patients");
const settings = require("../config/settings");
const { createLightweightAppointment, createFullPmsChart, markAppointmentNoShow } = require("../services/pmsService");
const {
  updatePatientStatus,
  calculateProgress,
  getKioskReadiness,
  getTransferReadiness,
  syncStatus
} = require("../services/patientStateService");
const { DEFAULT_CLINIC_ID, requireStaffAuth } = require("../middleware/auth");

const router = express.Router();

// Booking flow (Voice AI / live agent, spec §3 Step 1) creates the
// pre-arrival record before the patient ever reaches the kiosk or a staff
// member. In the real system this would carry its own service-to-service
// credential (the demo repo's api-key-authentication.md documents exactly
// this pattern — a scoped API key per integration) rather than the staff
// token, so it's deliberately left unguarded here.
router.post("/pre-arrival", async (req, res) => {
  const requiredFields = ["name", "dob", "phone", "appointmentTime"];
  const missingFields = requiredFields.filter((field) => !req.body[field]);

  if (missingFields.length > 0) {
    return res.status(400).json({ error: `Missing required fields: ${missingFields.join(", ")}` });
  }

  const newPatient = {
    id: `DC-${Date.now()}`,
    clinicId: req.body.clinicId || DEFAULT_CLINIC_ID,
    name: req.body.name,
    dob: req.body.dob,
    phone: req.body.phone,
    email: req.body.email || "",
    appointmentTime: req.body.appointmentTime,
    appointmentType: req.body.appointmentType || "New Patient Exam",
    providerName: req.body.providerName || "Unassigned",
    bookingAddress: req.body.bookingAddress || "",
    status: "pre_arrival",
    pmsAppointmentId: null,
    pmsPatientId: null,
    preArrivalState: {
      idScan: null,
      insuranceScan: null,
      addressOverride: null,
      idScanAttempts: 0,
      offerStaffAssist: false,
      forms: req.body.forms || {},
      dentverify: { status: "not_started", results: null },
      consentSignatures: { financialPolicy: null, treatmentConsent: null },
      followUps: []
    },
    progress: 10,
    noShowAt: null,
    previouslyCollectedAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  const appointment = await createLightweightAppointment(newPatient);
  newPatient.pmsAppointmentId = appointment.pmsAppointmentId;

  patients.push(newPatient);
  res.status(201).json({ patient: newPatient, appointment });
});

router.get("/:id", requireStaffAuth, (req, res) => {
  const patient = patients.find((p) => p.id === req.params.id && p.clinicId === req.clinicId);
  if (!patient) return res.status(404).json({ error: "Patient not found" });
  calculateProgress(patient);
  res.json({
    ...patient,
    kioskReadiness: getKioskReadiness(patient),
    transferReadiness: getTransferReadiness(patient)
  });
});

router.patch("/:id/kiosk-data", requireStaffAuth, (req, res) => {
  const patient = patients.find((p) => p.id === req.params.id && p.clinicId === req.clinicId);
  if (!patient) return res.status(404).json({ error: "Patient not found" });

  Object.assign(patient.preArrivalState, req.body);
  syncStatus(patient);
  calculateProgress(patient);
  patient.updatedAt = new Date().toISOString();
  res.json(patient);
});

router.post("/:id/checkin", requireStaffAuth, async (req, res) => {
  const patient = patients.find((p) => p.id === req.params.id && p.clinicId === req.clinicId);
  if (!patient) return res.status(404).json({ error: "Patient not found" });

  const { ready, blockers } = getTransferReadiness(patient);
  if (!ready) {
    return res.status(400).json({ error: "Patient is not ready for PMS transfer.", blockers });
  }

  const pmsChart = await createFullPmsChart(patient);
  patient.pmsPatientId = pmsChart.pmsPatientId;

  // Spec §7.3: on PMS transfer the DentVerify record is updated with the new
  // PMS patient ID so results auto-attach to the chart.
  const dentverify = patient.preArrivalState.dentverify;
  if (dentverify?.results) {
    dentverify.results.pmsPatientId = pmsChart.pmsPatientId;
    if (dentverify.results.identifier) {
      dentverify.results.identifier.pms_patient_id = pmsChart.pmsPatientId;
    }
  }

  patient.status = "checked_in";
  calculateProgress(patient);
  patient.updatedAt = new Date().toISOString();

  res.json({ message: "Patient checked in and transferred to PMS.", patient, pmsChart });
});

router.patch("/:id/status/no-show", requireStaffAuth, async (req, res) => {
  const patient = patients.find((p) => p.id === req.params.id && p.clinicId === req.clinicId);
  if (!patient) return res.status(404).json({ error: "Patient not found" });

  await markAppointmentNoShow(patient);
  try {
    updatePatientStatus(patient, "no_show");
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }

  patient.noShowAt = new Date().toISOString();
  res.json({ message: "Patient marked as no-show. No PMS chart was created.", patient });
});

router.post("/:id/reactivate", requireStaffAuth, (req, res) => {
  const patient = patients.find((p) => p.id === req.params.id && p.clinicId === req.clinicId);
  if (!patient) return res.status(404).json({ error: "Patient not found" });

  const collectedOn = patient.updatedAt;
  const dentverify = patient.preArrivalState.dentverify;

  // Spec §7.3 / §9.2: reuse a still-fresh DentVerify result instead of a
  // redundant re-check; anything older than the window needs re-verifying.
  const daysSinceNoShow = patient.noShowAt
    ? (Date.now() - new Date(patient.noShowAt).getTime()) / (1000 * 60 * 60 * 24)
    : Infinity;

  if (dentverify.status === "verified" && daysSinceNoShow <= settings.reVerificationWindowDays) {
    dentverify.status = "previously_verified";
  } else if (dentverify.results) {
    dentverify.status = "requires_reverification";
  }

  try {
    updatePatientStatus(patient, "reactivated");
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }

  patient.previouslyCollectedAt = collectedOn;
  syncStatus(patient);
  calculateProgress(patient);
  patient.updatedAt = new Date().toISOString();

  res.json({ message: "Patient record reactivated for rescheduling.", patient });
});

// Spec §5.1 quick action: log a follow-up contact attempt (CRM touch) without
// changing the patient's kiosk state.
router.post("/:id/follow-up", requireStaffAuth, (req, res) => {
  const patient = patients.find((p) => p.id === req.params.id && p.clinicId === req.clinicId);
  if (!patient) return res.status(404).json({ error: "Patient not found" });

  const entry = { note: (req.body && req.body.note) || "Follow-up logged", at: new Date().toISOString() };
  patient.preArrivalState.followUps = patient.preArrivalState.followUps || [];
  patient.preArrivalState.followUps.push(entry);
  patient.updatedAt = new Date().toISOString();

  res.json({ message: "Follow-up logged.", patient });
});

// Spec §5.4: "Archive (marks the record as inactive after configurable
// retention period)." Only a no-show record can be archived; it then drops
// off the active no-show list.
router.post("/:id/archive", requireStaffAuth, (req, res) => {
  const patient = patients.find((p) => p.id === req.params.id && p.clinicId === req.clinicId);
  if (!patient) return res.status(404).json({ error: "Patient not found" });
  if (patient.status !== "no_show") {
    return res.status(400).json({ error: "Only a no-show record can be archived." });
  }

  patient.archived = true;
  patient.archivedAt = new Date().toISOString();
  patient.updatedAt = new Date().toISOString();

  res.json({ message: "Record archived.", patient });
});

module.exports = router;
