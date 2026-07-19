const express = require("express");
const patients = require("../data/patients");
const { verifyInsurance } = require("../services/dentverifyService");
const { syncStatus, calculateProgress } = require("../services/patientStateService");

const router = express.Router();

router.post("/verify", async (req, res) => {
  const { dentcommRecordId, preArrival } = req.body;

  if (!preArrival) {
    return res.status(400).json({ error: "This endpoint currently supports pre-arrival verification only." });
  }

  const patient = patients.find((p) => p.id === dentcommRecordId);
  if (!patient) return res.status(404).json({ error: "Patient not found" });

  try {
    const results = await verifyInsurance(patient);
    patient.dentverify = { status: "verified", results };
    syncStatus(patient);
    calculateProgress(patient);
    patient.updatedAt = new Date().toISOString();
    res.json(results);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;
