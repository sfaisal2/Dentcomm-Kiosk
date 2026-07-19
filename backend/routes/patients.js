const express = require("express");
const patients = require("../data/patients");
const settings = require("../config/settings");
const { createLightweightAppointment, createFullPmsChart, markAppointmentNoShow } = require("../services/pmsService");
const {
  updatePatientStatus,
  calculateProgress,
  getTransferReadiness,
  syncStatus
} = require("../services/patientStateService");

const router = express.Router();

router.post("/pre-arrival", async (req, res) => {
  const requiredFields = ["name", "dob", "phone", "appointmentTime"];
  const missingFields = requiredFields.filter((field) => !req.body[field]);

  if (missingFields.length > 0) {
    return res.status(400).json({ error: `Missing required fields: ${missingFields.join(", ")}` });
  }

  const newPatient = {
    id: `DC-${Date.now()}`,
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
    kioskData: { idScan: null, insuranceScan: null, addressOverride: null },
    forms: req.body.forms || {},
    dentverify: { status: "not_started", results: null },
    consentSignatures: { financialPolicy: null, treatmentConsent: null },
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

router.get("/:id", (req, res) => {
  const patient = patients.find((p) => p.id === req.params.id);
  if (!patient) return res.status(404).json({ error: "Patient not found" });
  calculateProgress(patient);
  res.json({ ...patient, transferReadiness: getTransferReadiness(patient) });
});

router.patch("/:id/kiosk-data", (req, res) => {
  const patient = patients.find((p) => p.id === req.params.id);
  if (!patient) return res.status(404).json({ error: "Patient not found" });

  patient.kioskData = { ...patient.kioskData, ...req.body };
  syncStatus(patient);
  calculateProgress(patient);
  patient.updatedAt = new Date().toISOString();
  res.json(patient);
});

router.post("/:id/checkin", async (req, res) => {
  const patient = patients.find((p) => p.id === req.params.id);
  if (!patient) return res.status(404).json({ error: "Patient not found" });

  const { ready, blockers } = getTransferReadiness(patient);
  if (!ready) {
    return res.status(400).json({ error: "Patient is not ready for PMS transfer.", blockers });
  }

  const pmsChart = await createFullPmsChart(patient);
  patient.pmsPatientId = pmsChart.pmsPatientId;
  patient.status = "checked_in";
  calculateProgress(patient);
  patient.updatedAt = new Date().toISOString();

  res.json({ message: "Patient checked in and transferred to PMS.", patient, pmsChart });
});

router.patch("/:id/status/no-show", async (req, res) => {
  const patient = patients.find((p) => p.id === req.params.id);
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

router.post("/:id/reactivate", (req, res) => {
  const patient = patients.find((p) => p.id === req.params.id);
  if (!patient) return res.status(404).json({ error: "Patient not found" });

  const collectedOn = patient.updatedAt;

  // Spec §7.3 / §9.2: reuse a still-fresh DentVerify result instead of a
  // redundant re-check; anything older than the window needs re-verifying.
  const daysSinceNoShow = patient.noShowAt
    ? (Date.now() - new Date(patient.noShowAt).getTime()) / (1000 * 60 * 60 * 24)
    : Infinity;

  if (patient.dentverify.status === "verified" && daysSinceNoShow <= settings.reVerificationWindowDays) {
    patient.dentverify.status = "previously_verified";
  } else if (patient.dentverify.results) {
    patient.dentverify.status = "requires_reverification";
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

module.exports = router;
