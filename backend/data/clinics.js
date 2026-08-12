// Stands in for the real system's ClinicDoc (libs/backend/schema) — every
// patient record and API call in the real DentComm module is scoped to a
// clinic. Single demo clinic here; multi-clinic support is just adding rows.
const clinics = [
  {
    id: "CL-1001",
    name: "Demo Dental Practice",
    timezone: "America/Chicago"
  }
];

module.exports = clinics;
