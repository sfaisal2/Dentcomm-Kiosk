const { createWorker } = require("tesseract.js");
const settings = require("../config/settings");

// One worker, reused across requests — spinning a new one up per scan would
// reload the language data (a multi-second cost) on every call.
let workerPromise = null;
function getWorker() {
  if (!workerPromise) {
    workerPromise = createWorker("eng");
  }
  return workerPromise;
}

async function runOcr(imageInput) {
  const worker = await getWorker();
  const { data } = await worker.recognize(imageInput);
  return { text: data.text || "", confidenceScore: Math.round(data.confidence || 0) };
}

function firstMatch(text, patterns) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return (match[1] || match[0]).trim();
  }
  return null;
}

// Best-effort field parsing over raw OCR text. Government ID layouts vary
// by state/country and this has no template matching, so treat this as a
// heuristic first pass — anything it misses falls into needsStaffReview
// via missingFields, which is exactly what spec §6.3 asks for.
// Free-text capture groups deliberately use "[ \t]" instead of "\s" so a
// match can't bleed across a newline into the next printed line (e.g. a
// name label capturing into the DOB line right below it).
function parseIdFields(text) {
  const normalized = text.replace(/\r/g, "");
  return {
    legalName: firstMatch(normalized, [/(?:name|ln|fn)[:\s]+([A-Za-z,. \t]{3,50})/i]),
    dob: firstMatch(normalized, [
      /(?:dob|date of birth)[:\s]+(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i,
      /\b(\d{1,2}\/\d{1,2}\/(?:19|20)\d{2})\b/
    ]),
    address: firstMatch(normalized, [/(\d{1,6}[ \t]+[A-Za-z0-9. \t]{3,40},[ \t]*[A-Za-z \t]{2,25},?[ \t]*[A-Z]{2}[ \t]*\d{5})/]),
    idNumber: firstMatch(normalized, [/(?:dl|id|lic(?:ense)?)\s*#?[:\s]+([A-Z0-9]{6,15})/i]),
    issueDate: firstMatch(normalized, [/(?:iss|issue date)[:\s]+(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i]),
    stateOfIssue: firstMatch(normalized, [
      /\b([A-Z]{2})\s+DRIVER'?S? LICENSE\b/i,
      /\b(TX|CA|NY|FL|WA|IL|PA|OH|GA|NC|MI)\b/
    ])
  };
}

function parseInsuranceFields(text) {
  const normalized = text.replace(/\r/g, "");
  // Real cards almost never print an explicit "Carrier:" label — the
  // carrier's name is the header line. Fall back to the first non-empty
  // line when no labeled match is found.
  const firstLine = normalized.split("\n").map((line) => line.trim()).find((line) => line.length > 0) || null;

  return {
    carrier: firstMatch(normalized, [/(?:carrier|payer)[:\s]+([A-Za-z0-9,. \t]{3,40})/i]) || firstLine,
    memberId: firstMatch(normalized, [/(?:member\s*id|member\s*#|id\s*#)[:\s]+([A-Z0-9]{5,15})/i]),
    groupNumber: firstMatch(normalized, [/(?:group\s*(?:no\.?|number|#))[:\s]+([A-Z0-9]{3,15})/i]),
    planType: firstMatch(normalized, [/\b(PPO|HMO|DHMO|EPO|Indemnity)\b/i]),
    payerId: firstMatch(normalized, [/(?:payer\s*id|edi\s*#?)[:\s]+([A-Z0-9]{3,15})/i]),
    subscriberName: firstMatch(normalized, [/(?:subscriber\s*name|subscriber|member\s*name)[:\s]+([A-Za-z,. \t]{3,50})/i]),
    effectiveDate: firstMatch(normalized, [/(?:effective date)[:\s]+(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i])
  };
}

async function extractIdDataFromImage(imageInput) {
  if (!imageInput) {
    throw new Error("An ID image is required for OCR extraction.");
  }

  const { text, confidenceScore } = await runOcr(imageInput);
  const fields = parseIdFields(text);
  const missingFields = ["legalName", "dob", "address", "idNumber"].filter((field) => !fields[field]);

  return {
    ...fields,
    confidenceScore,
    source: "tesseract_ocr",
    entryMethod: "scan",
    rawText: text,
    missingFields,
    needsStaffReview: confidenceScore < settings.ocrConfidenceThreshold || missingFields.length > 0
  };
}

async function extractInsuranceDataFromImage(frontImageInput, backImageInput) {
  if (!frontImageInput) {
    throw new Error("An insurance card image is required for OCR extraction.");
  }

  const front = await runOcr(frontImageInput);
  const back = backImageInput ? await runOcr(backImageInput) : { text: "", confidenceScore: front.confidenceScore };
  const combinedText = `${front.text}\n${back.text}`;
  const confidenceScore = backImageInput
    ? Math.round((front.confidenceScore + back.confidenceScore) / 2)
    : front.confidenceScore;

  const fields = parseInsuranceFields(combinedText);
  const missingFields = ["memberId", "groupNumber"].filter((field) => !fields[field]);

  return {
    ...fields,
    confidenceScore,
    source: "tesseract_ocr",
    entryMethod: "scan",
    rawText: combinedText,
    missingFields,
    needsStaffReview: confidenceScore < settings.ocrConfidenceThreshold || missingFields.length > 0
  };
}

// Screen 2 (spec §4): prompt for address confirmation if the ID address
// doesn't match what was given at booking, OR the ID is stale.
function evaluateAddressPrompt(idScanData, patient) {
  const bookingAddress = (patient.bookingAddress || "").trim().toLowerCase();
  const scannedAddress = (idScanData.address || "").trim().toLowerCase();
  const addressMismatch = bookingAddress.length > 0 && bookingAddress !== scannedAddress;

  let idIsStale = false;
  const issueDate = new Date(idScanData.issueDate);
  if (!Number.isNaN(issueDate.getTime())) {
    const monthsOld = (Date.now() - issueDate.getTime()) / (1000 * 60 * 60 * 24 * 30.44);
    idIsStale = monthsOld > settings.addressPromptMonths;
  }

  return {
    needsAddressConfirmation: addressMismatch || idIsStale,
    addressConfirmationReason: addressMismatch ? "address_mismatch" : idIsStale ? "id_older_than_threshold" : null
  };
}

// Screen 3 failure path (spec §4): manual entry fallback if the card scan
// fails. Always flagged for staff review, and still re-triggers DentVerify.
function buildManualInsuranceEntry({ carrier, memberId, groupNumber, planType }) {
  return {
    carrier: carrier || null,
    memberId,
    groupNumber,
    planType: planType || null,
    payerId: null,
    subscriberName: null,
    effectiveDate: null,
    confidenceScore: null,
    source: "manual_entry",
    entryMethod: "manual",
    needsStaffReview: true
  };
}

module.exports = {
  extractIdDataFromImage,
  extractInsuranceDataFromImage,
  evaluateAddressPrompt,
  buildManualInsuranceEntry
};
