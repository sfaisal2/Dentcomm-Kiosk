# DentComm Kiosk Starter

This repository contains a working prototype of the DentComm Kiosk pre-arrival workflow, built against `DentComm_Kiosk_Feature_Spec_v1`.

It is intentionally built as a prototype with mock data for DentVerify, PMS, and patient storage so you can swap in the real integrations later. OCR is real — ID and insurance card scans run through Tesseract. The data model, clinic scoping, and two-tier auth are shaped to resemble the real DentTracks DentComm module (see [Architecture notes](#architecture-notes) below), though this is still a standalone prototype, not a merge into that codebase.

## What is implemented

- Patient lookup kiosk screen, scoped to a device-level kiosk session
- Government ID OCR scan (Tesseract) with best-effort field parsing
- Insurance card OCR scan (Tesseract) with best-effort field parsing
- Address confirmation prompt (stale/mismatched ID address)
- Forms review screen — home-form checklist + consent status, ending in a confirmation screen
- Staff-activated e-signature capture (financial policy + treatment consent) from the Transfer Panel
- Staff pre-arrival dashboard with per-row quick actions (Review / Verify / Follow Up / Check In)
- Arrival & Transfer Panel: identity match check, PMS transfer manifest, DentVerify benefits summary, PMS status
- Mock DentVerify insurance verification, including the spec §7.2 identifier block
- Check In & Transfer to PMS flow (lightweight appointment slot at booking vs. full chart at check-in)
- No-show archive flow with Reschedule/Archive actions
- Reactivation flow for no-show records, reusing a still-fresh DentVerify result
- Editable kiosk settings (staff-only) backing all kiosk behavior
- Kiosk idle timeout that auto-locks to the welcome screen and re-issues a fresh session
- Backend patient state machine (`pre_arrival` → `kiosk_in_progress` → `ready_to_transfer` → `checked_in`, plus `no_show`/`reactivated`)
- Clinic-scoped data and a two-tier auth model (staff bearer token vs. kiosk session token)

## Project structure

```text
backend/
  server.js
  config/settings.js
  data/
    clinics.js
    patients.js
  middleware/auth.js
  routes/
  services/
  utils/

frontend/
  src/App.jsx
  src/components/
  src/lib/api.js
  src/lib/generateConsentPdf.js
  src/styles.css
```

## How to run

From the root folder:

```bash
npm install
npm run install:all
npm run dev
```

Then open:

```text
http://localhost:5173
```

The backend runs on:

```text
http://localhost:5000
```

On startup the backend logs a dev staff token to the console (`Staff auth token (dev only): ...`) — see [Authentication](#authentication) below.

## Demo patient

Use this patient in the kiosk lookup:

```text
Name: Sarah Faisal
DOB: 01/15/1998
```

or phone:

```text
5551234567
```

## Authentication

There is no real login yet — this is a fixed-token stand-in for two distinct privilege levels, matching spec §2.1's requirement that the kiosk device authenticate as "a kiosk session, not a staff session":

- **Staff routes** (dashboard, settings writes, check-in, no-show, reactivate, follow-up, archive, signature capture, DentVerify re-verify) require `Authorization: Bearer <STAFF_TOKEN>`. Defaults to `dev-staff-token`; override with the `STAFF_AUTH_TOKEN` env var on the backend and `VITE_STAFF_AUTH_TOKEN` on the frontend.
- **Kiosk routes** (lookup, ID/insurance scan, address confirmation, forms) require a short-lived session token issued by `POST /dentcomm/kiosk/session`. The frontend fetches this automatically whenever the kiosk view is sitting at the welcome/lookup screen, including after an idle-timeout lock. A staff token is rejected on kiosk routes and vice versa.
- `GET /dentcomm/settings` and `POST /dentcomm/patients/pre-arrival` (the booking-system entry point) are left unauthenticated — the former is non-PHI config the kiosk needs before it has a session, the latter stands in for a service-to-service API key from the booking/Voice AI integration.

Swap this for real JWT/session verification before production.

## Recommended next steps

1. Replace `backend/data/patients.js` and `backend/data/clinics.js` with PostgreSQL or MongoDB.
2. Replace the fixed dev tokens in `backend/middleware/auth.js` with real authentication (JWT, Firebase, etc.) and role-based access.
3. `backend/services/ocrService.js` runs on Tesseract now, but its field parsing is regex/heuristic — it has no ID template matching. For production accuracy, pair it with (or replace it with) a dedicated document AI (Google Document AI, Azure Form Recognizer, AWS Textract) or parse the PDF417 barcode on the back of US driver's licenses (AAMVA format) instead of the printed text.
4. Replace `backend/services/dentverifyService.js` with the real DentVerify API.
5. Replace `backend/services/pmsService.js` with the real PMS API (Dentrix/Eaglesoft/Open Dental — see whichever the practice runs).
6. Move signed PDFs and scan images (`backend/uploads/`) to encrypted object storage (S3 + KMS) instead of local disk.
7. Add TLS, a Dockerfile, and lock down CORS from `*` to known origins.
8. Add retention/purge jobs for staging data and no-show records past the configured retention window.
9. Add audit logs and HIPAA-focused access controls.
10. Build the pre-visit forms-from-home portal (SMS/email link) — home forms are currently completed at the kiosk instead.

## Useful API endpoints

```text
POST  /dentcomm/kiosk/session
POST  /dentcomm/kiosk/lookup
POST  /dentcomm/kiosk/:id/id-scan
PATCH /dentcomm/kiosk/:id/address
POST  /dentcomm/kiosk/:id/insurance-scan
POST  /dentcomm/kiosk/:id/insurance-manual
POST  /dentcomm/kiosk/:id/forms/:formType/complete
POST  /dentcomm/kiosk/:id/signature
GET   /dentcomm/dashboard/pre-arrival?date=today
GET   /dentcomm/dashboard/no-show-archive
GET   /dentcomm/patients/:id
POST  /dentcomm/patients/pre-arrival
POST  /dentcomm/patients/:id/checkin
PATCH /dentcomm/patients/:id/status/no-show
POST  /dentcomm/patients/:id/reactivate
POST  /dentcomm/patients/:id/follow-up
POST  /dentcomm/patients/:id/archive
POST  /dentverify/verify
GET   /dentcomm/settings
PATCH /dentcomm/settings
```

## OCR notes

- The kiosk screens require a real image upload (any photo or screenshot with legible text works for testing) — there's no one-click mock scan.
- `tesseract.js` downloads its English language data on first use, which needs internet access the first time the backend runs. After that it's cached locally.
- The first scan after a cold backend start is slower (worker + language init); subsequent scans on the same running backend are faster since the worker is reused.
- Field extraction (name, DOB, member ID, etc.) is regex-based over Tesseract's raw text — it works well on clean, well-lit, label-formatted text and will legitimately come back with `needsStaffReview: true` and null fields on blurry photos or unusual card layouts. That's the fallback path working as intended, not a bug.

## Spec-driven behavior implemented

- Kiosk lookup only matches appointments within the configured window (default 4 hours) — see `backend/config/settings.js`.
- DentVerify is triggered automatically in the background as soon as the insurance card scan (or manual entry) is confirmed — the kiosk never blocks on it — and carries the spec §7.2 identifier block (`patient_identifier_type`, `dentcomm_record_id`, `patient_name`, `patient_dob`, `verification_context`, `pms_patient_id`).
- The ID scan address is compared against the booking address, and flagged for confirmation if it doesn't match or the ID is older than the configured threshold (default 12 months).
- OCR results below the configured confidence threshold (default 85%) are flagged `needsStaffReview` for the staff dashboard — never shown as an error on the kiosk screen.
- The government ID number is never included in the PMS transfer payload (`backend/services/pmsService.js`).
- `ready_to_transfer` requires the ID scan, insurance scan, DentVerify result, and home forms — signatures are collected separately by staff at check-in and are not required to reach this state.
- Check-in additionally requires both consent signatures before the PMS transfer will proceed.
- Reactivating a no-show reuses a still-fresh DentVerify result (within the configured re-verification window) instead of forcing a redundant check.

## Architecture notes

Per spec §2.1, the kiosk is meant to be "a new feature layer within the existing DentComm patient engagement and CRM module ... not a standalone module" — extending the real Patient schema with a `pre_arrival_state` object rather than a separate database. This prototype follows that shape as closely as it can as a standalone app:

- **`preArrivalState`** on each patient record (`backend/data/patients.js`) holds everything kiosk-collected — `idScan`, `insuranceScan`, `forms`, `dentverify`, `consentSignatures` — nested off the core identity/appointment fields, so it could graft onto a real Patient schema without a shape clash.
- **Clinic scoping** (`backend/data/clinics.js`, `clinicId` on every patient) mirrors the real system's multi-tenant model, where every API call is scoped to a clinic.
- **Two data zones** in `backend/services/pmsService.js` — `createLightweightAppointment` (booking-time, minimal pointer) vs. `createFullPmsChart` (check-in-time, full transfer) — match spec §2.3's three-zone data architecture.

This was reverse-engineered against a read-only look at a related DentTracks demo repository (DTOs, module structure, auth guard shape) — no code, credentials, or endpoints from that repo were copied in; it only informed field-naming and structural choices here.
