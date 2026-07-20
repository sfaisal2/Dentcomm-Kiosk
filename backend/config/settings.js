// Kiosk Configuration Settings — spec §8. In production these belong in
// DentComm Settings (per-practice, editable by staff), not a static file.
const settings = {
  noShowWindowHours: 2,
  addressPromptMonths: 12,
  autoReminderPreVisitHours: 24,
  autoReminderDayOfHours: 2,
  dentVerifyAutoTrigger: true,
  ocrConfidenceThreshold: 85,
  consentTiming: "at_arrival",
  archiveRetentionDays: 90,
  reVerificationWindowDays: 30,
  kioskSessionTimeoutMinutes: 3,
  kioskLookupWindowHours: 4,
  // Spec §6.1 — ZIP prefixes considered inside the practice service area.
  // Empty array disables the check. Demo practice is Houston, TX (770xx/771xx).
  serviceAreaZipPrefixes: ["770", "771", "772", "773", "774", "775"]
};

module.exports = settings;
