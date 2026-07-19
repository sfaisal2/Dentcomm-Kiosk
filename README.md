# DentComm Kiosk Starter

This repository now contains a working starter implementation for the DentComm Kiosk pre-arrival workflow.

It is intentionally built as a prototype with mock data for DentVerify, PMS, and patient storage so you can swap in the real integrations later. OCR is real — ID and insurance card scans run through Tesseract.

## What is implemented

- Patient lookup kiosk screen
- Government ID OCR scan (Tesseract) with best-effort field parsing
- Insurance card OCR scan (Tesseract) with best-effort field parsing
- Mock consent signature capture
- Staff pre-arrival dashboard
- Patient profile review panel
- Mock DentVerify insurance verification
- Check In & Transfer to PMS flow
- No-show archive flow
- Reactivation flow for no-show records
- Backend patient state machine

## Project structure

```text
backend/
  server.js
  data/patients.js
  routes/
  services/

frontend/
  src/App.jsx
  src/components/
  src/lib/api.js
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

## Demo patient

Use this patient in the kiosk lookup:

```text
Name: Aisha Khan
DOB: 01/15/1998
```

or phone:

```text
5551234567
```

## Recommended next steps

1. Replace `backend/data/patients.js` with PostgreSQL or another database.
2. Add real authentication and role-based access.
3. `backend/services/ocrService.js` runs on Tesseract now, but its field parsing is regex/heuristic — it has no ID template matching. For production accuracy, pair it with (or replace it with) a dedicated document AI (Google Document AI, Azure Form Recognizer, AWS Textract) or parse the PDF417 barcode on the back of US driver's licenses (AAMVA format) instead of the printed text.
4. Replace `backend/services/dentverifyService.js` with the real DentVerify API.
5. Replace `backend/services/pmsService.js` with the real PMS API.
6. Add secure file storage for scanned ID and insurance card images (currently the images are OCR'd in memory and discarded — only the extracted fields are kept).
7. Add audit logs and HIPAA-focused access controls.

## Useful API endpoints

```text
POST  /dentcomm/kiosk/lookup
POST  /dentcomm/kiosk/:id/id-scan
PATCH /dentcomm/kiosk/:id/address
POST  /dentcomm/kiosk/:id/insurance-scan
POST  /dentcomm/kiosk/:id/insurance-manual
POST  /dentcomm/kiosk/:id/signature
GET   /dentcomm/dashboard/pre-arrival
GET   /dentcomm/dashboard/no-show-archive
GET   /dentcomm/patients/:id
POST  /dentverify/verify
POST  /dentcomm/patients/:id/checkin
PATCH /dentcomm/patients/:id/status/no-show
POST  /dentcomm/patients/:id/reactivate
```

## OCR notes

- The kiosk screens now require a real image upload (any photo or screenshot with legible text works for testing) — there's no more one-click mock scan.
- `tesseract.js` downloads its English language data on first use, which needs internet access the first time the backend runs. After that it's cached locally.
- The first scan after a cold backend start is slower (worker + language init); subsequent scans on the same running backend are faster since the worker is reused.
- Field extraction (name, DOB, member ID, etc.) is regex-based over Tesseract's raw text — it works well on clean, well-lit, label-formatted text and will legitimately come back with `needsStaffReview: true` and null fields on blurry photos or unusual card layouts. That's the fallback path working as intended, not a bug.

## Spec-driven behavior implemented

- Kiosk lookup only matches appointments within the configured window (default 4 hours) — see `backend/config/settings.js`.
- DentVerify is triggered automatically in the background as soon as the insurance card scan (or manual entry) is confirmed — the kiosk never blocks on it.
- The ID scan address is compared against the booking address, and flagged for confirmation if it doesn't match or the ID is older than the configured threshold (default 12 months).
- OCR results below the configured confidence threshold (default 85%) are flagged `needsStaffReview` for the staff dashboard — never shown as an error on the kiosk screen.
- The government ID number is never included in the PMS transfer payload (`backend/services/pmsService.js`).
- `ready_to_transfer` requires both consent signatures **and** a verified DentVerify result, not signatures alone.
- Reactivating a no-show reuses a still-fresh DentVerify result (within the configured re-verification window) instead of forcing a redundant check.
