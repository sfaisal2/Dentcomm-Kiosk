const clinics = require("../data/clinics");

const DEFAULT_CLINIC_ID = clinics[0].id;

// Stand-in for the real system's staff login (Firebase-backed JWT in the
// demo repo). A fixed dev token is enough to demonstrate the two-tier guard
// shape spec §2.1 requires — swap for real JWT verification before production.
const STAFF_TOKEN = process.env.STAFF_AUTH_TOKEN || "dev-staff-token";

// Spec §2.1: "The kiosk device ... opens a dedicated patient-facing DentComm
// view — authenticated as a kiosk session, not a staff session." A kiosk
// session is scoped to one clinic, short-lived, and carries none of the
// staff bearer token's privileges — it can only reach kiosk routes.
const kioskSessions = new Map();

function issueKioskSession(clinicId, timeoutMinutes) {
  const token = `kiosk_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  kioskSessions.set(token, {
    clinicId,
    expiresAt: Date.now() + timeoutMinutes * 60 * 1000
  });
  return token;
}

function endKioskSession(token) {
  kioskSessions.delete(token);
}

function bearerToken(req) {
  const header = req.headers.authorization || "";
  return header.startsWith("Bearer ") ? header.slice(7) : null;
}

// Guards staff-facing routes (dashboard, settings writes, check-in, no-show,
// etc.) — mirrors the demo repo's @UseGuards(JwtWithApiKeyGuard) +
// @GetClinic() pattern in dentcomm.controller.ts.
function requireStaffAuth(req, res, next) {
  const token = bearerToken(req);
  if (token !== STAFF_TOKEN) {
    return res.status(401).json({ error: "Staff authentication required." });
  }
  req.clinicId = req.headers["x-clinic-id"] || DEFAULT_CLINIC_ID;
  req.staffUser = { id: "staff-demo", name: "Front Desk" };
  next();
}

// Guards patient-facing kiosk routes. Only a token issued by
// POST /dentcomm/kiosk/session is accepted — a staff token is deliberately
// rejected here so a staff login can never operate the patient-facing flow.
function requireKioskSession(req, res, next) {
  const token = bearerToken(req);
  const session = token && kioskSessions.get(token);

  if (!session || session.expiresAt < Date.now()) {
    if (session) kioskSessions.delete(token);
    return res.status(401).json({ error: "Kiosk session expired or invalid. Please look up your appointment again." });
  }

  req.clinicId = session.clinicId;
  req.kioskSessionToken = token;
  next();
}

module.exports = {
  DEFAULT_CLINIC_ID,
  STAFF_TOKEN,
  issueKioskSession,
  endKioskSession,
  requireStaffAuth,
  requireKioskSession
};
