const express = require("express");
const patients = require("../data/patients");
const { calculateProgress } = require("../services/patientStateService");

const router = express.Router();

router.get("/pre-arrival", (req, res) => {
  const preArrivalPatients = patients
    .filter((patient) => ["pre_arrival", "kiosk_in_progress", "ready_to_transfer", "reactivated"].includes(patient.status))
    .map((patient) => {
      calculateProgress(patient);
      return patient;
    });

  res.json(preArrivalPatients);
});

router.get("/no-show-archive", (req, res) => {
  res.json(patients.filter((patient) => patient.status === "no_show"));
});

module.exports = router;
