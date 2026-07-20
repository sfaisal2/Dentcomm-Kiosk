const express = require("express");
const fs = require("fs");
const path = require("path");
const patients = require("../data/patients");
const settings = require("../config/settings");
const {
  extractIdDataFromImage,
  extractInsuranceDataFromImage,
  evaluateAddressPrompt,
  buildManualInsuranceEntry,
  flagZipServiceArea
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

const SIGNATURES_DIR = path.join(__dirname, "..", "uploads", "signatures");
const SCANS_DIR = path.join(__dirname, "..", "uploads", "scans");

// Stands in for the real system's S3 upload — same contract (write the
// bytes once, return a reference URL, never keep the raw signature data
// on the patient record itself).
function saveSignedDocument(patientId, formType, pdfBase64) {
  fs.mkdirSync(SIGNATURES_DIR, { recursive: true });
  const buffer = decodeImage(pdfBase64);
  if (!buffer || buffer.length === 0) {
    throw new Error("The signed PDF was empty or could not be decoded.");
  }

  const fileName = `${patientId}-${formType}-${Date.now()}.pdf`;
  fs.writeFileSync(path.join(SIGNATURES_DIR, fileName), buffer);
  return `/uploads/signatures/${fileName}`;
}

// Spec §6.3: "All original scanned images ... are stored in the DentComm
// patient record and transferred to the PMS chart as image attachments."
// So we persist the raw scan bytes and keep a URL on the record, rather than
// discarding the image after OCR.
function saveScanImage(patientId, kind, buffer) {
  if (!buffer || buffer.length === 0) return null;
  fs.mkdirSync(SCANS_DIR, { recursive: true });
  const fileName = `${patientId}-${kind}-${Date.now()}.png`;
  fs.writeFileSync(path.join(SCANS_DIR, fileName), buffer);
  return `/uploads/scans/${fileName}`;
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
    const zipCheck = flagZipServiceArea(extractedIdData, settings);
    const imageUrl = saveScanImage(patient.id, "id", imageBuffer);

    patient.kioskData.idScan = { ...extractedIdData, ...addressCheck, ...zipCheck, imageUrl };
    patient.kioskData.addressOverride = null;

    // Screen 2 failure path (spec §4): after 2 failed scans, offer staff assist.
    // A "failed" scan here = OCR couldn't extract cleanly (needs staff review).
    patient.kioskData.idScanAttempts = (patient.kioskData.idScanAttempts || 0) + 1;
    patient.kioskData.offerStaffAssist =
      extractedIdData.needsStaffReview && patient.kioskData.idScanAttempts >= 2;

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
    const frontImageUrl = saveScanImage(patient.id, "insurance-front", frontBuffer);
    const backImageUrl = saveScanImage(patient.id, "insurance-back", backBuffer);

    patient.kioskData.insuranceScan = { ...extractedInsuranceData, frontImageUrl, backImageUrl };
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

// Screen 4 (spec §4): if a required home form wasn't completed remotely, the
// patient can complete it inline at the kiosk. Consent forms are excluded —
// those are signed at check-in, not marked complete here.
router.post("/:id/forms/:formType/complete", (req, res) => {
  const patient = findPatient(req.params.id);
  if (!patient) return res.status(404).json({ error: "Patient not found" });

  const { formType } = req.params;
  const homeForms = ["medicalHistory", "healthQuestionnaire", "hipaaAcknowledgment"];
  if (!homeForms.includes(formType)) {
    return res.status(400).json({ error: "Unknown or non-self-serve form type." });
  }

  patient.forms[formType] = { completed: true, completedAt: new Date().toISOString() };

  syncStatus(patient);
  calculateProgress(patient);
  patient.updatedAt = new Date().toISOString();
  res.json(patient);
});

// Mirrors the real consent-form pattern: the client generates the signed
// PDF (embedding the signature image) and uploads it here; we keep only a
// document reference on the patient record, never the raw signature pixels.
// Staff-activated at check-in (spec Screen 5) — not part of the patient flow.
router.post("/:id/signature", (req, res) => {
  const patient = findPatient(req.params.id);
  if (!patient) return res.status(404).json({ error: "Patient not found" });

  const { formType, pdfBase64 } = req.body;
  if (!["financialPolicy", "treatmentConsent"].includes(formType)) {
    return res.status(400).json({ error: "Invalid form type" });
  }
  if (!pdfBase64) {
    return res.status(400).json({ error: "A signed PDF is required." });
  }

  let documentUrl;
  try {
    documentUrl = saveSignedDocument(patient.id, formType, pdfBase64);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }

  patient.consentSignatures[formType] = { documentUrl, signedAt: new Date().toISOString() };

  syncStatus(patient);
  calculateProgress(patient);
  patient.updatedAt = new Date().toISOString();
  res.json(patient);
});

module.exports = router;
