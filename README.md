# DentComm Kiosk Starter

This repository now contains a working starter implementation for the DentComm Kiosk pre-arrival workflow.

It is intentionally built as a prototype with mock data and mock integrations so you can start adding real OCR, DentVerify, PMS, database, and authentication logic later.

## What is implemented

- Patient lookup kiosk screen
- Mock government ID OCR scan
- Mock insurance card OCR scan
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
3. Replace `backend/services/ocrService.js` with Google Document AI, Azure Form Recognizer, AWS Textract, Tesseract, ML Kit, or a scanner SDK.
4. Replace `backend/services/dentverifyService.js` with the real DentVerify API.
5. Replace `backend/services/pmsService.js` with the real PMS API.
6. Add secure file storage for scanned ID and insurance card images.
7. Add audit logs and HIPAA-focused access controls.

## Useful API endpoints

```text
POST /dentcomm/kiosk/lookup
POST /dentcomm/kiosk/:id/id-scan
POST /dentcomm/kiosk/:id/insurance-scan
POST /dentcomm/kiosk/:id/signature
GET  /dentcomm/dashboard/pre-arrival
GET  /dentcomm/dashboard/no-show-archive
GET  /dentcomm/patients/:id
POST /dentverify/verify
POST /dentcomm/patients/:id/checkin
PATCH /dentcomm/patients/:id/status/no-show
POST /dentcomm/patients/:id/reactivate
```
