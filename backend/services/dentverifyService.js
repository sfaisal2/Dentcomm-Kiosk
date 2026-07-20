const { splitName } = require("../utils/name");

// Mirrors the real DentVerify system's request shape (its CreateEVDto):
// patientId is optional there too — a demographic-only EV is exactly the
// pre_arrival path this kiosk relies on, keyed on name/DOB/subscriber
// instead of a chart ID.
function buildRequestPayload(patient) {
  const insurance = patient.kioskData.insuranceScan;
  const { firstName: patientFirstName, lastName: patientLastName } = splitName(patient.name);
  const subscriberName = insurance.subscriberName || patient.name;
  const { firstName: subscriberFirstName, lastName: subscriberLastName } = splitName(subscriberName);

  return {
    patientId: patient.pmsPatientId || undefined,
    appointmentDate: patient.appointmentTime,
    patientFirstName,
    patientLastName,
    patientDob: patient.dob,
    subscriberFirstName,
    subscriberLastName,
    subscriberDob: patient.dob,
    memberId: insurance.memberId || null,
    insuranceName: insurance.carrier || null,
    payorId: insurance.payerId || null
  };
}

// Real clearinghouse responses (Optum/Vyne) aren't a tidy
// {annualMaximum, deductibleStatus, coveragePercentages} object — they're a
// flat, string-keyed dictionary of ~250 fields straight from the payer
// (e.g. MaxBenefits, DeductiblesRemainingIndividualInNetwork,
// PreventiveCoverageInNetwork). We generate a representative subset of
// that shape here, then derive the friendly summary the kiosk UI and spec
// actually ask for from it — same two-layer shape a real integration would
// have (raw payer fields -> normalized display fields).
function buildEvFormFields(patient, requestPayload) {
  const insurance = patient.kioskData.insuranceScan;

  return {
    PatientName: patient.name,
    PatientDOB: patient.dob,
    SubscriberName: `${requestPayload.subscriberFirstName} ${requestPayload.subscriberLastName}`.trim(),
    SubscriberId: insurance.memberId || null,
    InsuranceName: insurance.carrier || null,
    PayerId: insurance.payerId || null,
    GroupNumber: insurance.groupNumber || null,
    PolicyType: insurance.planType || null,
    PolicyEffectiveDate: insurance.effectiveDate || null,
    MemberStatus: "Active",
    MaxBenefits: "$1,500",
    BenefitsRemaining: "$1,450",
    DeductiblesAppliedIndividualInNetwork: "$0",
    DeductiblesRemainingIndividualInNetwork: "$50",
    PreventiveCoverageInNetwork: "100%",
    BasicCoverageInNetwork: "80%",
    MajorCoverageInNetwork: "50%"
  };
}

function deriveSummary(evFormFields) {
  return {
    annualMaximum: evFormFields.MaxBenefits,
    deductibleStatus: `${evFormFields.DeductiblesRemainingIndividualInNetwork} remaining`,
    coveragePercentages: {
      preventive: evFormFields.PreventiveCoverageInNetwork,
      basic: evFormFields.BasicCoverageInNetwork,
      major: evFormFields.MajorCoverageInNetwork
    }
  };
}

async function verifyInsurance(patient) {
  const insurance = patient.kioskData.insuranceScan;

  if (!insurance) {
    throw new Error("Insurance data is missing.");
  }

  const requestPayload = buildRequestPayload(patient);
  const evFormFields = buildEvFormFields(patient, requestPayload);

  return {
    verificationId: `DV-${Date.now()}`,
    patientIdentifierType: "dentcomm_pre_arrival",
    dentcommRecordId: patient.id,
    pmsPatientId: patient.pmsPatientId || null,
    status: "verified",
    requestPayload,
    evFormFields,
    ...deriveSummary(evFormFields),
    badge: "Kiosk patient — chart pending",
    verifiedAt: new Date().toISOString()
  };
}

module.exports = { verifyInsurance };
