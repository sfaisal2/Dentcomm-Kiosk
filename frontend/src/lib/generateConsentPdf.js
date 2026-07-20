import { jsPDF } from "jspdf";

const FORM_COPY = {
  financialPolicy: {
    title: "Financial Policy Agreement",
    body: "I understand that payment for dental services is due at the time services are rendered, unless prior arrangements have been made. I authorize the practice to bill my insurance carrier on my behalf and understand I am responsible for any portion not covered by insurance."
  },
  treatmentConsent: {
    title: "Treatment Consent",
    body: "I authorize the dentist and staff to perform the dental services deemed necessary based on the examination and diagnosis. I understand the nature of the proposed treatment and its risks and benefits have been explained to me."
  }
};

// Mirrors the real DentComm consent-form pattern: render the form's copy
// plus the captured signature into a PDF client-side, rather than storing
// the raw signature image anywhere on the server.
export function generateConsentPdf({ formType, patientName, signatureDataUrl }) {
  const copy = FORM_COPY[formType];
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const marginX = 56;
  let y = 72;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text(copy.title, marginX, y);

  y += 28;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  const bodyLines = doc.splitTextToSize(copy.body, 500);
  doc.text(bodyLines, marginX, y);
  y += bodyLines.length * 16 + 24;

  doc.text(`Patient: ${patientName}`, marginX, y);
  y += 18;
  doc.text(`Date: ${new Date().toLocaleDateString()}`, marginX, y);
  y += 32;

  doc.setFont("helvetica", "bold");
  doc.text("Signature:", marginX, y);
  y += 12;
  doc.addImage(signatureDataUrl, "PNG", marginX, y, 220, 80);

  return doc.output("datauristring");
}
