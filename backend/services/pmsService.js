const { v4: uuidv4 } = require("uuid");
const { splitName } = require("../utils/name");

async function createLightweightAppointment(patient) {
  const { firstName, lastName } = splitName(patient.name);

  return {
    pmsAppointmentId: `PMS-APT-${uuidv4()}`,
    firstName,
    lastName,
    mobilePhone: patient.phone,
    appointmentTime: patient.appointmentTime,
    dentcommRecordId: patient.id,
    statusTag: "Kiosk pending"
  };
}

async function createFullPmsChart(patient) {
  const { firstName, lastName } = splitName(patient.name);
  const state = patient.preArrivalState;
  const idScan = state.idScan || {};

  // Real PMS patient-write DTOs use firstName/lastName/mobilePhone/
  // addressLine1, not our internal kiosk field names — and, per spec §9.1,
  // the ID number never leaves DentComm, so it's deliberately absent here.
  const demographics = {
    firstName,
    lastName,
    dob: patient.dob,
    mobilePhone: patient.phone,
    email: patient.email || null,
    addressLine1: state.addressOverride?.updatedAddress || idScan.address || null
  };

  // OCR provenance kept separately from the normalized demographics above —
  // a real PMS write wouldn't accept these fields, but staff still need
  // them for identity-verification review.
  const identityVerification = {
    legalName: idScan.legalName || null,
    issueDate: idScan.issueDate || null,
    stateOfIssue: idScan.stateOfIssue || null,
    confidenceScore: idScan.confidenceScore ?? null,
    source: idScan.source || null,
    entryMethod: idScan.entryMethod || null
  };

  // Spec §6.3: original scanned images travel to the PMS chart as attachments.
  const insuranceScan = state.insuranceScan || {};
  const imageAttachments = [
    { kind: "government_id", url: idScan.imageUrl },
    { kind: "insurance_card_front", url: insuranceScan.frontImageUrl },
    { kind: "insurance_card_back", url: insuranceScan.backImageUrl },
    ...(state.consentSignatures?.financialPolicy
      ? [{ kind: "financial_policy_signed", url: state.consentSignatures.financialPolicy.documentUrl }]
      : []),
    ...(state.consentSignatures?.treatmentConsent
      ? [{ kind: "treatment_consent_signed", url: state.consentSignatures.treatmentConsent.documentUrl }]
      : [])
  ].filter((a) => a.url);

  return {
    pmsPatientId: `PMS-CHART-${uuidv4()}`,
    createdAt: new Date().toISOString(),
    transferredData: {
      demographics,
      identityVerification,
      addressOverride: state.addressOverride,
      insurance: state.insuranceScan,
      forms: state.forms,
      consentSignatures: state.consentSignatures,
      dentverifyResults: state.dentverify.results,
      imageAttachments
    }
  };
}

async function markAppointmentNoShow(patient) {
  return {
    pmsAppointmentId: patient.pmsAppointmentId,
    status: "no_show",
    updatedAt: new Date().toISOString()
  };
}

module.exports = {
  createLightweightAppointment,
  createFullPmsChart,
  markAppointmentNoShow
};
