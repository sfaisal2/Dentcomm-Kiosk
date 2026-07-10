const express = require("express");
const patients = require("../data/patients");
const { extractIdDataFromImage, extractInsuranceDataFromImage } = require("../services/ocrService");
const { calculateProgress } = require("../services/patientStateService");

const router = express.Router();

router.post("/lookup", (req, res) => {
  const { name, dob, phone } = req.body;

  const patient = patients.find((p) => {
    const nameMatch = name && p.name.toLowerCase().trim() === name.toLowerCase().trim();
    const dobMatch = dob && p.dob === dob;
    const phoneMatch = phone && p.phone.replace(/\D/g, "") === phone.replace(/\D/g, "");
    return (nameMatch && dobMatch) || phoneMatch;
  });

  if (!patient || patient.status === "checked_in" || patient.status === "no_show") {
    return res.status(404).json({ message: "Please see the front desk." });
  }

  res.json({ message: `Welcome, ${patient.name}`, patient });
});

router.post("/:id/id-scan", async (req, res) => {
  const patient = patients.find((p) => p.id === req.params.id);
  if (!patient) return res.status(404).json({ error: "Patient not found" });

  const { imageUrl = "mock-id-image.jpg", addressOverride = null } = req.body;
  const extractedIdData = await extractIdDataFromImage(imageUrl);

  patient.kioskData.idScan = extractedIdData;
  patient.kioskData.addressOverride = addressOverride;
  if (patient.status === "pre_arrival" || patient.status === "reactivated") {
    patient.status = "kiosk_in_progress";
  }
  calculateProgress(patient);
  patient.updatedAt = new Date().toISOString();
  res.json(patient);
});

router.post("/:id/insurance-scan", async (req, res) => {
  const patient = patients.find((p) => p.id === req.params.id);
  if (!patient) return res.status(404).json({ error: "Patient not found" });

  const { frontImageUrl = "mock-insurance-front.jpg", backImageUrl = "mock-insurance-back.jpg" } = req.body;
  const extractedInsuranceData = await extractInsuranceDataFromImage(frontImageUrl, backImageUrl);

  patient.kioskData.insuranceScan = extractedInsuranceData;
  calculateProgress(patient);
  patient.updatedAt = new Date().toISOString();
  res.json(patient);
});

router.post("/:id/signature", (req, res) => {
  const patient = patients.find((p) => p.id === req.params.id);
  if (!patient) return res.status(404).json({ error: "Patient not found" });

  const { formType, signatureImageUrl = "signature-captured" } = req.body;
  if (!["financialPolicy", "treatmentConsent"].includes(formType)) {
    return res.status(400).json({ error: "Invalid form type" });
  }

  patient.consentSignatures[formType] = { signatureImageUrl, signedAt: new Date().toISOString() };

  if (patient.consentSignatures.financialPolicy && patient.consentSignatures.treatmentConsent) {
    patient.status = "ready_to_transfer";
  }

  calculateProgress(patient);
  patient.updatedAt = new Date().toISOString();
  res.json(patient);
});

module.exports = router;
