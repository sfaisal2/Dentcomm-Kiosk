const express = require("express");
const settings = require("../config/settings");

const router = express.Router();

// Spec §8: kiosk behavior is configured in DentComm Settings. The kiosk
// device reads the values it needs (e.g. idle timeout) from here rather than
// hardcoding them, so a settings change takes effect without a rebuild.
router.get("/", (req, res) => {
  res.json(settings);
});

// Spec §8 lists the editable kiosk settings — anything else (and any
// wrong-typed value) is rejected so a typo can't corrupt kiosk behavior.
const EDITABLE_SETTINGS = {
  noShowWindowHours: "number",
  addressPromptMonths: "number",
  autoReminderPreVisitHours: "number",
  autoReminderDayOfHours: "number",
  dentVerifyAutoTrigger: "boolean",
  ocrConfidenceThreshold: "number",
  consentTiming: "string",
  archiveRetentionDays: "number",
  reVerificationWindowDays: "number",
  kioskSessionTimeoutMinutes: "number"
};

router.patch("/", (req, res) => {
  const updates = req.body || {};
  const errors = [];

  for (const [key, value] of Object.entries(updates)) {
    if (!(key in EDITABLE_SETTINGS)) {
      errors.push(`Unknown setting: ${key}`);
    } else if (typeof value !== EDITABLE_SETTINGS[key]) {
      errors.push(`${key} must be a ${EDITABLE_SETTINGS[key]}`);
    } else if (EDITABLE_SETTINGS[key] === "number" && (!Number.isFinite(value) || value < 0)) {
      errors.push(`${key} must be a non-negative number`);
    }
  }

  if (errors.length > 0) {
    return res.status(400).json({ error: errors.join("; ") });
  }

  Object.assign(settings, updates);
  res.json(settings);
});

module.exports = router;
