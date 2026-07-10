const express = require("express");
const patients = require("../data/patients");
const { createLightweightAppointment, createFullPmsChart, markAppointmentNoShow } = require("../services/pmsService");
const { updatePatientStatus, calculateProgress } = require("../services/patientStateService");

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
    status: "pre_arrival",
    pmsAppointmentId: null,
    pmsPatientId: null,
    kioskData: { idScan: null, insuranceScan: null, addressOverride: null },
    forms: req.body.forms || {},
    dentverify: { status: "not_started", results: null },
    consentSignatures: { financialPolicy: null, treatmentConsent: null },
    progress: 25,
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
  res.json(patient);
});

router.patch("/:id/kiosk-data", (req, res) => {
  const patient = patients.find((p) => p.id === req.params.id);
  if (!patient) return res.status(404).json({ error: "Patient not found" });

  patient.kioskData = { ...patient.kioskData, ...req.body };
  if (patient.status === "pre_arrival") patient.status = "kiosk_in_progress";
  calculateProgress(patient);
  patient.updatedAt = new Date().toISOString();
  res.json(patient);
});

router.post("/:id/checkin", async (req, res) => {
  const patient = patients.find((p) => p.id === req.params.id);
  if (!patient) return res.status(404).json({ error: "Patient not found" });

  if (!patient.kioskData.idScan || !patient.kioskData.insuranceScan) {
    return res.status(400).json({ error: "Patient is missing ID scan or insurance scan data." });
  }

  if (!patient.consentSignatures.financialPolicy || !patient.consentSignatures.treatmentConsent) {
    return res.status(400).json({ error: "Required consent signatures are missing." });
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

  res.json({ message: "Patient marked as no-show. No PMS chart was created.", patient });
});

router.post("/:id/reactivate", (req, res) => {
  const patient = patients.find((p) => p.id === req.params.id);
  if (!patient) return res.status(404).json({ error: "Patient not found" });

  try {
    updatePatientStatus(patient, "reactivated");
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }

  res.json({ message: "Patient record reactivated for rescheduling.", patient });
});

module.exports = router;
