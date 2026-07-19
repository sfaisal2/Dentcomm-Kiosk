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
  kioskLookupWindowHours: 4
};

module.exports = settings;
