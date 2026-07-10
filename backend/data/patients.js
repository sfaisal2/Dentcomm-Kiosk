const patients = [
  {
    id: "DC-1001",
    name: "Aisha Khan",
    dob: "01/15/1998",
    phone: "5551234567",
    email: "aisha@example.com",
    appointmentTime: "2026-05-20T10:00:00",
    appointmentType: "New Patient Exam",
    providerName: "Dr. YarKhan",
    status: "pre_arrival",
    pmsAppointmentId: "PMS-APT-5001",
    pmsPatientId: null,
    kioskData: {
      idScan: null,
      insuranceScan: null,
      addressOverride: null
    },
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
    progress: 25,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
];

module.exports = patients;
