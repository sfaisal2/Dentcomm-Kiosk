const { v4: uuidv4 } = require("uuid");

async function createLightweightAppointment(patient) {
  return {
    pmsAppointmentId: `PMS-APT-${uuidv4()}`,
    name: patient.name,
    phone: patient.phone,
    appointmentTime: patient.appointmentTime,
    dentcommRecordId: patient.id,
    statusTag: "Kiosk pending"
  };
}

async function createFullPmsChart(patient) {
  return {
    pmsPatientId: `PMS-CHART-${uuidv4()}`,
    createdAt: new Date().toISOString(),
    transferredData: {
      demographics: patient.kioskData.idScan,
      insurance: patient.kioskData.insuranceScan,
      forms: patient.forms,
      consentSignatures: patient.consentSignatures,
      dentverifyResults: patient.dentverify.results
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
