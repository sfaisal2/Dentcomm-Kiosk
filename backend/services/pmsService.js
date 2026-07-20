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
  const idScan = patient.kioskData.idScan || {};

  // Real PMS patient-write DTOs use firstName/lastName/mobilePhone/
  // addressLine1, not our internal kiosk field names — and, per spec §9.1,
  // the ID number never leaves DentComm, so it's deliberately absent here.
  const demographics = {
    firstName,
    lastName,
    dob: patient.dob,
    mobilePhone: patient.phone,
    email: patient.email || null,
    addressLine1: patient.kioskData.addressOverride?.updatedAddress || idScan.address || null
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
  const insuranceScan = patient.kioskData.insuranceScan || {};
  const imageAttachments = [
    { kind: "government_id", url: idScan.imageUrl },
    { kind: "insurance_card_front", url: insuranceScan.frontImageUrl },
    { kind: "insurance_card_back", url: insuranceScan.backImageUrl },
    ...(patient.consentSignatures?.financialPolicy
      ? [{ kind: "financial_policy_signed", url: patient.consentSignatures.financialPolicy.documentUrl }]
      : []),
    ...(patient.consentSignatures?.treatmentConsent
      ? [{ kind: "treatment_consent_signed", url: patient.consentSignatures.treatmentConsent.documentUrl }]
      : [])
  ].filter((a) => a.url);

  return {
    pmsPatientId: `PMS-CHART-${uuidv4()}`,
    createdAt: new Date().toISOString(),
    transferredData: {
      demographics,
      identityVerification,
      addressOverride: patient.kioskData.addressOverride,
      insurance: patient.kioskData.insuranceScan,
      forms: patient.forms,
      consentSignatures: patient.consentSignatures,
      dentverifyResults: patient.dentverify.results,
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
