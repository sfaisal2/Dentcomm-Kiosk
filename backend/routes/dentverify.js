const express = require("express");
const patients = require("../data/patients");
const { verifyInsurance } = require("../services/dentverifyService");
const { syncStatus, calculateProgress } = require("../services/patientStateService");
const { requireStaffAuth } = require("../middleware/auth");

const router = express.Router();

// The kiosk's own auto-trigger (spec §7.1) calls verifyInsurance() directly
// from kiosk.js, in-process — it never hits this HTTP route. This route is
// only reached by the staff dashboard's "Re-verify insurance" action, so it
// carries the staff guard rather than a kiosk session.
router.post("/verify", requireStaffAuth, async (req, res) => {
  const { dentcommRecordId, preArrival } = req.body;

  if (!preArrival) {
    return res.status(400).json({ error: "This endpoint currently supports pre-arrival verification only." });
  }

  const patient = patients.find((p) => p.id === dentcommRecordId && p.clinicId === req.clinicId);
  if (!patient) return res.status(404).json({ error: "Patient not found" });

  try {
    const results = await verifyInsurance(patient);
    patient.preArrivalState.dentverify = { status: "verified", results };
    syncStatus(patient);
    calculateProgress(patient);
    patient.updatedAt = new Date().toISOString();
    res.json(results);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;
