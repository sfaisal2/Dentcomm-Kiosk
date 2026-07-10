const express = require("express");
const cors = require("cors");

const patientRoutes = require("./routes/patients");
const kioskRoutes = require("./routes/kiosk");
const dashboardRoutes = require("./routes/dashboard");
const dentverifyRoutes = require("./routes/dentverify");

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json({ limit: "10mb" }));

app.use("/dentcomm/patients", patientRoutes);
app.use("/dentcomm/kiosk", kioskRoutes);
app.use("/dentcomm/dashboard", dashboardRoutes);
app.use("/dentverify", dentverifyRoutes);

app.get("/", (req, res) => {
  res.json({
    message: "DentComm Kiosk API is running",
    endpoints: [
      "POST /dentcomm/kiosk/lookup",
      "GET /dentcomm/dashboard/pre-arrival",
      "GET /dentcomm/patients/:id",
      "POST /dentcomm/patients/:id/checkin"
    ]
  });
});

app.use((req, res) => {
  res.status(404).json({ error: "Route not found" });
});

app.listen(PORT, () => {
  console.log(`DentComm Kiosk backend running on http://localhost:${PORT}`);
});
