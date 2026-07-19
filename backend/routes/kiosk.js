const express = require("express");
const patients = require("../data/patients");
const settings = require("../config/settings");
const {
  extractIdDataFromImage,
  extractInsuranceDataFromImage,
  evaluateAddressPrompt,
  buildManualInsuranceEntry
} = require("../services/ocrService");
const { verifyInsurance } = require("../services/dentverifyService");
const { calculateProgress, syncStatus } = require("../services/patientStateService");

const router = express.Router();

function findPatient(id) {
  return patients.find((p) => p.id === id);
}

// Kiosk sends images as base64 (data URL or bare base64) in the JSON body —
// Tesseract accepts a Buffer directly, no temp file needed.
function decodeImage(base64OrDataUrl) {
  if (!base64OrDataUrl) return null;
  const base64 = base64OrDataUrl.includes(",") ? base64OrDataUrl.split(",")[1] : base64OrDataUrl;
  return Buffer.from(base64, "base64");
}

// Screen 1 (spec §4): only match appointments within the next N hours.
function withinLookupWindow(patient) {
  const apptTime = new Date(patient.appointmentTime).getTime();
  const windowMs = settings.kioskLookupWindowHours * 60 * 60 * 1000;
  const now = Date.now();
  return apptTime >= now && apptTime - now <= windowMs;
}

router.post("/lookup", (req, res) => {
  const { name, dob, phone } = req.body;

  const patient = patients.find((p) => {
    const nameMatch = name && p.name.toLowerCase().trim() === name.toLowerCase().trim();
    const dobMatch = dob && p.dob === dob;
    const phoneMatch = phone && p.phone.replace(/\D/g, "") === phone.replace(/\D/g, "");
    return (nameMatch && dobMatch) || phoneMatch;
  });

  const eligibleStatuses = ["pre_arrival", "kiosk_in_progress", "ready_to_transfer", "reactivated"];
  if (!patient || !eligibleStatuses.includes(patient.status) || !withinLookupWindow(patient)) {
    return res.status(404).json({ message: "Please see the front desk." });
  }

  res.json({ message: `Welcome, ${patient.name}`, patient });
});

router.post("/:id/id-scan", async (req, res) => {
  const patient = findPatient(req.params.id);
  if (!patient) return res.status(404).json({ error: "Patient not found" });

  try {
    const imageBuffer = decodeImage(req.body.imageBase64);
    const extractedIdData = await extractIdDataFromImage(imageBuffer);
    const addressCheck = evaluateAddressPrompt(extractedIdData, patient);

    patient.kioskData.idScan = { ...extractedIdData, ...addressCheck };
    patient.kioskData.addressOverride = null;

    syncStatus(patient);
    calculateProgress(patient);
    patient.updatedAt = new Date().toISOString();
    res.json(patient);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Screen 2 (spec §4): patient confirms the ID-scanned address or supplies
// an update. Either way the outcome is flagged on the DentComm record.
router.patch("/:id/address", (req, res) => {
  const patient = findPatient(req.params.id);
  if (!patient) return res.status(404).json({ error: "Patient not found" });
  if (!patient.kioskData.idScan) {
    return res.status(400).json({ error: "ID scan must be completed first." });
  }

  const { confirmed, updatedAddress } = req.body;
  patient.kioskData.addressOverride = {
    confirmed: !!confirmed,
    updatedAddress: confirmed ? null : (updatedAddress || null),
    flaggedAt: new Date().toISOString()
  };

  syncStatus(patient);
  calculateProgress(patient);
  patient.updatedAt = new Date().toISOString();
  res.json(patient);
});

// Fires DentVerify in the background and lets the response return
// immediately — spec §4 Screen 3: "Do not wait for results to proceed."
function triggerDentVerify(patient) {
  patient.dentverify = { status: "pending", results: null };
  verifyInsurance(patient)
    .then((results) => {
      patient.dentverify = { status: "verified", results };
      syncStatus(patient);
      calculateProgress(patient);
      patient.updatedAt = new Date().toISOString();
    })
    .catch((error) => {
      patient.dentverify = { status: "failed", results: null, error: error.message };
      patient.updatedAt = new Date().toISOString();
    });
}

router.post("/:id/insurance-scan", async (req, res) => {
  const patient = findPatient(req.params.id);
  if (!patient) return res.status(404).json({ error: "Patient not found" });

  try {
    const frontBuffer = decodeImage(req.body.frontImageBase64);
    const backBuffer = decodeImage(req.body.backImageBase64);
    const extractedInsuranceData = await extractInsuranceDataFromImage(frontBuffer, backBuffer);

    patient.kioskData.insuranceScan = extractedInsuranceData;
    if (settings.dentVerifyAutoTrigger) triggerDentVerify(patient);

    syncStatus(patient);
    calculateProgress(patient);
    patient.updatedAt = new Date().toISOString();
    res.json(patient);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Screen 3 failure path (spec §4): manual entry fallback if the card scan
// fails. Always flagged for staff review, and still re-triggers DentVerify.
router.post("/:id/insurance-manual", (req, res) => {
  const patient = findPatient(req.params.id);
  if (!patient) return res.status(404).json({ error: "Patient not found" });

  const { memberId, groupNumber, carrier, planType } = req.body;
  if (!memberId || !groupNumber) {
    return res.status(400).json({ error: "Member ID and group number are required for manual entry." });
  }

  patient.kioskData.insuranceScan = buildManualInsuranceEntry({ carrier, memberId, groupNumber, planType });
  if (settings.dentVerifyAutoTrigger) triggerDentVerify(patient);

  syncStatus(patient);
  calculateProgress(patient);
  patient.updatedAt = new Date().toISOString();
  res.json(patient);
});

router.post("/:id/signature", (req, res) => {
  const patient = findPatient(req.params.id);
  if (!patient) return res.status(404).json({ error: "Patient not found" });

  const { formType, signatureImageUrl = "signature-captured" } = req.body;
  if (!["financialPolicy", "treatmentConsent"].includes(formType)) {
    return res.status(400).json({ error: "Invalid form type" });
  }

  patient.consentSignatures[formType] = { signatureImageUrl, signedAt: new Date().toISOString() };

  syncStatus(patient);
  calculateProgress(patient);
  patient.updatedAt = new Date().toISOString();
  res.json(patient);
});

module.exports = router;
