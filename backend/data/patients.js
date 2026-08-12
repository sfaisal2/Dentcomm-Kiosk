const clinics = require("./clinics");

// Demo appointment is anchored to server start time so the kiosk lookup
// window (spec §Screen 1 — "appointments within the next 4 hours") has
// something valid to match against on every run.
const demoAppointmentTime = new Date(Date.now() + 60 * 60 * 1000).toISOString();

const patients = [
  {
    id: "DC-1001",
    clinicId: clinics[0].id,
    name: "Sarah Faisal",
    dob: "01/15/1998",
    phone: "5551234567",
    email: "sarah@example.com",
    appointmentTime: demoAppointmentTime,
    appointmentType: "New Patient Exam",
    providerName: "Dr. YarKhan",
    bookingAddress: "123 Main Street, Houston, TX 77001",
    status: "pre_arrival",
    pmsAppointmentId: "PMS-APT-5001",
    pmsPatientId: null,
    // Spec §2.1: "No separate database schema needs to be designed from
    // scratch — extend the existing DentComm patient record with a
    // pre_arrival_state object and kiosk-specific fields." Everything the
    // kiosk collects lives here, nested off the core identity/appointment
    // fields above, so a real Patient schema (patientId/guarantorId/etc.,
    // as in libs/backend/schema/patient.schema.ts) could gain this same
    // object without a shape clash once a PMS chart exists.
    preArrivalState: {
      idScan: null,
      insuranceScan: null,
      addressOverride: null,
      idScanAttempts: 0,
      offerStaffAssist: false,
      forms: {
        medicalHistory: { completed: true, completedAt: "2026-05-19T18:30:00" },
        healthQuestionnaire: { completed: true, completedAt: "2026-05-19T18:35:00" },
        hipaaAcknowledgment: { completed: true, completedAt: "2026-05-19T18:40:00" },
        financialPolicy: { completed: false, requiresSignatureAtArrival: true },
        treatmentConsent: { completed: false, requiresSignatureAtArrival: true }
      },
      dentverify: {
        status: "not_started",
        results: null
      },
      consentSignatures: {
        financialPolicy: null,
        treatmentConsent: null
      },
      followUps: []
    },
    progress: 10,
    noShowAt: null,
    previouslyCollectedAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
];

module.exports = patients;
