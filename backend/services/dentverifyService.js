async function verifyInsurance(patient) {
  const insurance = patient.kioskData.insuranceScan;

  if (!insurance) {
    throw new Error("Insurance data is missing.");
  }

  return {
    verificationId: `DV-${Date.now()}`,
    patientIdentifierType: "dentcomm_pre_arrival",
    dentcommRecordId: patient.id,
    pmsPatientId: null,
    status: "verified",
    annualMaximum: "$1,500",
    deductibleStatus: "$50 remaining",
    coveragePercentages: {
      preventive: "100%",
      basic: "80%",
      major: "50%"
    },
    badge: "Kiosk patient — chart pending",
    verifiedAt: new Date().toISOString()
  };
}

module.exports = { verifyInsurance };
