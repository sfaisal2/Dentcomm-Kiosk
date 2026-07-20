const express = require("express");
const settings = require("../config/settings");

const router = express.Router();

// Spec §8: kiosk behavior is configured in DentComm Settings. The kiosk
// device reads the values it needs (e.g. idle timeout) from here rather than
// hardcoding them, so a settings change takes effect without a rebuild.
router.get("/", (req, res) => {
  res.json(settings);
});

module.exports = router;
