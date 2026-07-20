import { useEffect, useRef, useState } from "react";
import PatientLookup from "./components/PatientLookup";
import ProgressBadge from "./components/ProgressBadge";
import SignaturePad from "./components/SignaturePad";
import { fileToBase64 } from "./lib/fileToBase64";
import { generateConsentPdf } from "./lib/generateConsentPdf";
import { getSignatureDataUrl } from "./lib/signature";
import {
  API_BASE_URL,
  archivePatient,
  captureSignature,
  checkInPatient,
  completeForm,
  confirmAddress,
  followUpPatient,
  getNoShowArchive,
  getPatient,
  getPreArrivalPatients,
  getSettings,
  markNoShow,
  reactivatePatient,
  scanId,
  scanInsurance,
  submitInsuranceManually,
  updateSettings,
  verifyInsurance
} from "./lib/api";
import "./styles.css";

const CONSENT_FORMS = [
  { key: "financialPolicy", label: "Financial Policy" },
  { key: "treatmentConsent", label: "Treatment Consent" }
];

const HOME_FORMS = [
  { key: "medicalHistory", label: "Medical History" },
  { key: "healthQuestionnaire", label: "Health Questionnaire" },
  { key: "hipaaAcknowledgment", label: "HIPAA Acknowledgment" }
];

function StepButton({ children, onClick, disabled }) {
  return <button className="secondary" onClick={onClick} disabled={disabled}>{children}</button>;
}

function IdScanStep({ patient, onScanned }) {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function runScan() {
    if (!file) return;
    setLoading(true);
    setError("");
    try {
      const imageBase64 = await fileToBase64(file);
      onScanned(await scanId(patient.id, imageBase64));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="scan-controls">
      <input type="file" accept="image/*" onChange={(e) => setFile(e.target.files[0] || null)} />
      <StepButton onClick={runScan} disabled={!file || loading}>{loading ? "Reading ID with OCR..." : "Scan ID"}</StepButton>
      {patient.kioskData?.offerStaffAssist && (
        <p className="notice">We're having trouble reading your ID. Please ask a staff member to assist.</p>
      )}
      {error && <p className="notice">{error}</p>}
    </div>
  );
}

function InsuranceScanStep({ patient, onScanned, disabled }) {
  const [frontFile, setFrontFile] = useState(null);
  const [backFile, setBackFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function runScan() {
    if (!frontFile) return;
    setLoading(true);
    setError("");
    try {
      const frontImageBase64 = await fileToBase64(frontFile);
      const backImageBase64 = backFile ? await fileToBase64(backFile) : null;
      onScanned(await scanInsurance(patient.id, frontImageBase64, backImageBase64));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="scan-controls">
      <label className="muted">
        Front of card
        <input type="file" accept="image/*" disabled={disabled} onChange={(e) => setFrontFile(e.target.files[0] || null)} />
      </label>
      <label className="muted">
        Back of card
        <input type="file" accept="image/*" disabled={disabled} onChange={(e) => setBackFile(e.target.files[0] || null)} />
      </label>
      <StepButton onClick={runScan} disabled={disabled || !frontFile || loading}>
        {loading ? "Reading card with OCR..." : "Scan insurance card"}
      </StepButton>
      {error && <p className="notice">{error}</p>}
    </div>
  );
}

function AddressConfirmPrompt({ patient, onUpdated }) {
  const [updatedAddress, setUpdatedAddress] = useState("");
  const [editing, setEditing] = useState(false);

  async function confirm() {
    onUpdated(await confirmAddress(patient.id, { confirmed: true }));
  }

  async function saveUpdate() {
    onUpdated(await confirmAddress(patient.id, { confirmed: false, updatedAddress }));
  }

  return (
    <div className="prompt-box">
      <p><strong>Is this still your current address?</strong></p>
      <p className="muted">{patient.kioskData.idScan.address}</p>
      {!editing ? (
        <div className="action-row">
          <button onClick={confirm}>Yes, that's correct</button>
          <button className="secondary" onClick={() => setEditing(true)}>No, update it</button>
        </div>
      ) : (
        <div className="action-row">
          <input placeholder="New address" value={updatedAddress} onChange={(e) => setUpdatedAddress(e.target.value)} />
          <button onClick={saveUpdate} disabled={!updatedAddress}>Save</button>
        </div>
      )}
    </div>
  );
}

function InsuranceManualEntry({ patient, onSubmitted }) {
  const [memberId, setMemberId] = useState("");
  const [groupNumber, setGroupNumber] = useState("");

  async function submit() {
    onSubmitted(await submitInsuranceManually(patient.id, { memberId, groupNumber }));
  }

  return (
    <div className="prompt-box">
      <p><strong>Enter insurance details manually</strong></p>
      <div className="form-grid">
        <input placeholder="Member ID" value={memberId} onChange={(e) => setMemberId(e.target.value)} />
        <input placeholder="Group number" value={groupNumber} onChange={(e) => setGroupNumber(e.target.value)} />
        <button onClick={submit} disabled={!memberId || !groupNumber}>Submit</button>
      </div>
    </div>
  );
}

// Screen 4 (spec §4): Forms Review — checklist of all forms with status, inline
// completion of incomplete home forms, and a final submit.
function FormsReviewStep({ patient, onUpdated, onSubmit }) {
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  async function complete(formType) {
    setBusy(formType);
    setError("");
    try {
      onUpdated(await completeForm(patient.id, formType));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy("");
    }
  }

  const allHomeComplete = HOME_FORMS.every((f) => patient.forms?.[f.key]?.completed);

  return (
    <div className="forms-review">
      <ul className="forms-list">
        {HOME_FORMS.map(({ key, label }) => {
          const form = patient.forms?.[key];
          return (
            <li key={key}>
              <span>{label}</span>
              {form?.completed ? (
                <span className="pill complete">✓ Completed{form.completedAt ? ` ${new Date(form.completedAt).toLocaleDateString()}` : ""}</span>
              ) : (
                <button className="secondary small" onClick={() => complete(key)} disabled={busy === key}>
                  {busy === key ? "Saving..." : "Complete now"}
                </button>
              )}
            </li>
          );
        })}
        {CONSENT_FORMS.map(({ key, label }) => (
          <li key={key}>
            <span>{label}</span>
            <span className="pill pending">Signature collected at check-in</span>
          </li>
        ))}
      </ul>
      {error && <p className="notice">{error}</p>}
      <button onClick={onSubmit} disabled={!allHomeComplete}>Submit — I'll see you inside!</button>
    </div>
  );
}

function KioskConfirmation({ patient, onDone }) {
  return (
    <section className="card kiosk-card">
      <p className="eyebrow">All set</p>
      <h1>Thank you, {patient.name.split(" ")[0]}!</h1>
      <p>Your check-in information is complete.</p>
      <p className="muted">Appointment: {new Date(patient.appointmentTime).toLocaleString()} with {patient.providerName}</p>
      <p className="notice success">Please have a seat — a staff member will check you in shortly.</p>
      <button className="link-button" onClick={onDone}>Done</button>
    </section>
  );
}

function KioskFlow() {
  const [patient, setPatient] = useState(null);
  const [message, setMessage] = useState("");
  const [showManualInsurance, setShowManualInsurance] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const timerRef = useRef(null);
  const timeoutMsRef = useRef(3 * 60 * 1000);

  // Idle timeout is configured in DentComm Settings (spec §8).
  useEffect(() => {
    getSettings()
      .then((s) => {
        if (s?.kioskSessionTimeoutMinutes) timeoutMsRef.current = s.kioskSessionTimeoutMinutes * 60 * 1000;
      })
      .catch(() => {});
  }, []);

  // Auto-lock to the welcome screen after inactivity (spec §8/§9.1) so no PHI
  // stays on screen for the next person.
  useEffect(() => {
    if (!patient) return undefined;

    function resetTimer() {
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        setPatient(null);
        setSubmitted(false);
        setShowManualInsurance(false);
        setMessage("");
        setTimedOut(true);
      }, timeoutMsRef.current);
    }

    const events = ["mousemove", "mousedown", "keydown", "touchstart", "click"];
    events.forEach((e) => window.addEventListener(e, resetTimer));
    resetTimer();

    return () => {
      clearTimeout(timerRef.current);
      events.forEach((e) => window.removeEventListener(e, resetTimer));
    };
  }, [patient]);

  function startSession(found) {
    setTimedOut(false);
    setPatient(found);
  }

  if (patient && submitted) {
    return <KioskConfirmation patient={patient} onDone={() => { setSubmitted(false); setPatient(null); }} />;
  }

  if (!patient) {
    return (
      <>
        {timedOut && (
          <p className="notice session-banner">Your session timed out for privacy. Please look up your appointment again.</p>
        )}
        <PatientLookup onFound={startSession} />
      </>
    );
  }

  const idScan = patient.kioskData?.idScan;
  const insuranceScan = patient.kioskData?.insuranceScan;
  const addressPending = idScan?.needsAddressConfirmation && !patient.kioskData?.addressOverride;

  return (
    <section className="card kiosk-card">
      <p className="eyebrow">Patient-facing kiosk</p>
      <h1>Hello, {patient.name}</h1>
      <p className="muted">Appointment: {new Date(patient.appointmentTime).toLocaleString()} with {patient.providerName}</p>
      <ProgressBadge value={patient.progress} status={patient.status} />

      <div className="step-list">
        <div className="step">
          <h3>1. Government ID scan</h3>
          <p>Place your government-issued photo ID on the scanner. OCR extracts your name, DOB, address, and issue date.</p>
          <IdScanStep patient={patient} onScanned={(updated) => { setPatient(updated); setMessage("ID scan saved."); }} />

          {addressPending && (
            <AddressConfirmPrompt patient={patient} onUpdated={(updated) => { setPatient(updated); setMessage("Address confirmation saved."); }} />
          )}
        </div>

        <div className="step">
          <h3>2. Insurance card scan</h3>
          <p>Place the front and back of your insurance card on the scanner. OCR extracts carrier, member ID, group number, and plan type.</p>
          <InsuranceScanStep
            patient={patient}
            disabled={!idScan || addressPending}
            onScanned={(updated) => { setPatient(updated); setMessage("Insurance scan saved."); }}
          />
          <button className="link-button" disabled={!idScan || addressPending} onClick={() => setShowManualInsurance((v) => !v)}>
            Scan failed? Enter manually
          </button>

          {showManualInsurance && (
            <InsuranceManualEntry patient={patient} onSubmitted={(updated) => { setPatient(updated); setMessage("Insurance details saved."); setShowManualInsurance(false); }} />
          )}

          {insuranceScan && patient.dentverify.status === "pending" && (
            <p className="notice">We are checking your insurance benefits in the background — no action needed.</p>
          )}
        </div>

        <div className="step">
          <h3>3. Forms review</h3>
          <p>Review your intake forms. Financial policy and treatment consent are signed with a staff member at check-in.</p>
          <FormsReviewStep
            patient={patient}
            onUpdated={(updated) => { setPatient(updated); setMessage("Form updated."); }}
            onSubmit={() => setSubmitted(true)}
          />
        </div>
      </div>

      {message && <p className="notice">{message}</p>}
      <button className="link-button" onClick={() => setPatient(null)}>Back to lookup</button>
    </section>
  );
}

const badgeLabels = {
  formsStatus: { complete: "Forms complete", partial: "Forms partial" },
  insuranceStatus: { verified: "Insurance verified", pending: "Insurance pending", not_started: "Insurance not started" }
};

function StatusBadges({ badges }) {
  if (!badges) return null;
  return (
    <div className="badge-row">
      <span className={`pill ${badges.formsStatus}`}>{badgeLabels.formsStatus[badges.formsStatus]}</span>
      <span className={`pill ${badges.insuranceStatus}`}>{badgeLabels.insuranceStatus[badges.insuranceStatus]}</span>
      {badges.needsAttention && <span className="pill attention">Needs attention</span>}
    </div>
  );
}

// Screen 5 (spec §4): staff-activated signature pad. Staff opens this from the
// check-in panel and hands the device to the patient to sign.
function StaffSignatureCapture({ patient, onSigned }) {
  const canvasRef = useRef(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const nextForm = CONSENT_FORMS.find((f) => !patient.consentSignatures?.[f.key]);

  async function sign() {
    if (!nextForm) return;
    setSaving(true);
    setError("");
    try {
      const signatureDataUrl = getSignatureDataUrl(canvasRef);
      if (!signatureDataUrl) {
        setError("Please have the patient sign before continuing.");
        return;
      }
      const pdfBase64 = generateConsentPdf({ formType: nextForm.key, patientName: patient.name, signatureDataUrl });
      const updated = await captureSignature(patient.id, nextForm.key, pdfBase64);
      canvasRef.current?.clear();
      onSigned(updated);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  if (!nextForm) {
    return <p className="notice success">Both consent documents are signed.</p>;
  }

  return (
    <div className="prompt-box">
      <p><strong>Collect signature — {nextForm.label}</strong></p>
      <p className="muted">Hand the device to the patient to sign.</p>
      <SignaturePad ref={canvasRef} onClear={() => setError("")} />
      <button onClick={sign} disabled={saving}>{saving ? "Saving..." : `Save ${nextForm.label} signature`}</button>
      {error && <p className="notice">{error}</p>}
    </div>
  );
}

// Spec §5.3: "Identity confirmation: name and DOB match between ID scan and
// booking record."
function IdentityConfirmation({ patient }) {
  const idScan = patient.kioskData?.idScan;
  if (!idScan) return <p className="muted">Identity confirmation pending — no ID scan yet.</p>;

  const nameMatch = (idScan.legalName || "").trim().toLowerCase() === patient.name.trim().toLowerCase();
  const dobMatch = (idScan.dob || "") === patient.dob;

  return (
    <div className="identity-check">
      <p>
        Name: <strong>{idScan.legalName || "—"}</strong> vs booking <strong>{patient.name}</strong>{" "}
        <span className={`pill ${nameMatch ? "complete" : "attention"}`}>{nameMatch ? "✓ Match" : "Mismatch — verify"}</span>
      </p>
      <p>
        DOB: <strong>{idScan.dob || "—"}</strong> vs booking <strong>{patient.dob}</strong>{" "}
        <span className={`pill ${dobMatch ? "complete" : "attention"}`}>{dobMatch ? "✓ Match" : "Mismatch — verify"}</span>
      </p>
    </div>
  );
}

// Spec §5.3: "DentVerify benefits summary: annual maximum, deductible status,
// coverage percentages."
function BenefitsSummary({ dentverify }) {
  const results = dentverify?.results;
  if (!results) return <p className="muted">No DentVerify results yet ({dentverify?.status || "not started"}).</p>;

  const coverage = results.coveragePercentages || {};
  return (
    <>
      <ul className="benefits-summary">
        <li><span>Annual maximum</span><strong>{results.annualMaximum || "—"}</strong></li>
        <li><span>Deductible</span><strong>{results.deductibleStatus || "—"}</strong></li>
        <li><span>Preventive</span><strong>{coverage.preventive || "—"}</strong></li>
        <li><span>Basic</span><strong>{coverage.basic || "—"}</strong></li>
        <li><span>Major</span><strong>{coverage.major || "—"}</strong></li>
      </ul>
      {results.badge && <span className="pill pending">{results.badge}</span>}
      <details>
        <summary className="muted">Raw verification record</summary>
        <pre>{JSON.stringify(results, null, 2)}</pre>
      </details>
    </>
  );
}

// Spec §5.3: "Complete list of what will be written to the PMS on transfer."
function TransferManifest({ patient }) {
  const idScan = patient.kioskData?.idScan;
  const insurance = patient.kioskData?.insuranceScan;
  const attachments = [idScan?.imageUrl, insurance?.frontImageUrl, insurance?.backImageUrl].filter(Boolean).length;
  const signedForms = CONSENT_FORMS.filter((f) => patient.consentSignatures?.[f.key]).length;
  const homeForms = HOME_FORMS.filter((f) => patient.forms?.[f.key]?.completed).length;

  const items = [
    { label: "Demographics (from ID scan)", included: !!idScan, note: patient.kioskData?.addressOverride ? "includes patient-provided address override" : null },
    { label: "Insurance information", included: !!insurance, note: insurance?.entryMethod === "manual" ? "manual entry" : null },
    { label: `Completed forms as PDFs (${homeForms}/${HOME_FORMS.length})`, included: homeForms > 0 },
    { label: `Consent signatures (${signedForms}/${CONSENT_FORMS.length})`, included: signedForms > 0 },
    { label: "DentVerify eligibility results", included: !!patient.dentverify?.results },
    { label: `Original scan images (${attachments} attachments)`, included: attachments > 0 },
    { label: "ID number", included: false, note: "stays in DentComm — never transferred (spec §6.1/§9.1)" }
  ];

  return (
    <ul className="transfer-manifest">
      {items.map(({ label, included, note }) => (
        <li key={label}>
          <span className={included ? "" : "muted"}>{included ? "✓" : "✕"} {label}</span>
          {note && <small className="muted"> — {note}</small>}
        </li>
      ))}
    </ul>
  );
}

// Spec §8: all kiosk settings are managed inside DentComm Settings — no
// separate admin panel. Field list and defaults mirror the §8 table.
const SETTINGS_FIELDS = [
  { key: "noShowWindowHours", label: "No-show window (hours)", type: "number" },
  { key: "addressPromptMonths", label: "Address prompt rule (ID older than N months)", type: "number" },
  { key: "autoReminderPreVisitHours", label: "Auto-reminder pre-visit (hours before)", type: "number" },
  { key: "autoReminderDayOfHours", label: "Auto-reminder day-of (hours before)", type: "number" },
  { key: "dentVerifyAutoTrigger", label: "DentVerify auto-trigger", type: "boolean" },
  { key: "ocrConfidenceThreshold", label: "OCR confidence threshold (%)", type: "number" },
  { key: "consentTiming", label: "Consent timing", type: "text" },
  { key: "archiveRetentionDays", label: "Archive retention (days)", type: "number" },
  { key: "reVerificationWindowDays", label: "Re-verification window (days)", type: "number" },
  { key: "kioskSessionTimeoutMinutes", label: "Kiosk session timeout (minutes)", type: "number" }
];

function SettingsPanel() {
  const [values, setValues] = useState(null);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getSettings().then(setValues).catch((e) => setMessage(e.message));
  }, []);

  function setField(key, raw, type) {
    setValues((v) => ({ ...v, [key]: type === "number" ? Number(raw) : raw }));
  }

  async function save() {
    setSaving(true);
    setMessage("");
    try {
      const updates = {};
      for (const { key } of SETTINGS_FIELDS) updates[key] = values[key];
      setValues(await updateSettings(updates));
      setMessage("Settings saved.");
    } catch (e) {
      setMessage(e.message);
    } finally {
      setSaving(false);
    }
  }

  if (!values) return <section className="card kiosk-card"><p className="muted">{message || "Loading settings..."}</p></section>;

  return (
    <section className="card kiosk-card">
      <p className="eyebrow">DentComm Settings</p>
      <h2>Kiosk configuration</h2>
      <div className="settings-grid">
        {SETTINGS_FIELDS.map(({ key, label, type }) => (
          <label key={key} className="muted">
            {label}
            {type === "boolean" ? (
              <input type="checkbox" checked={!!values[key]} onChange={(e) => setField(key, e.target.checked, type)} />
            ) : (
              <input type={type} value={values[key] ?? ""} onChange={(e) => setField(key, e.target.value, type)} />
            )}
          </label>
        ))}
      </div>
      <button onClick={save} disabled={saving}>{saving ? "Saving..." : "Save settings"}</button>
      {message && <p className="notice">{message}</p>}
    </section>
  );
}

function StaffDashboard() {
  const [patients, setPatients] = useState([]);
  const [archive, setArchive] = useState([]);
  const [selected, setSelected] = useState(null);
  const [message, setMessage] = useState("");

  async function load() {
    const [preArrival, noShows] = await Promise.all([getPreArrivalPatients(), getNoShowArchive()]);
    setPatients(preArrival);
    setArchive(noShows);
    if (selected) {
      try {
        setSelected(await getPatient(selected.id));
      } catch {
        setSelected(null);
      }
    }
  }

  useEffect(() => { load(); }, []);

  async function selectPatient(id) {
    setSelected(await getPatient(id));
    setMessage("");
  }

  async function staffAction(action, fallbackMessage) {
    try {
      const result = await action();
      setMessage(result.message || fallbackMessage);
      if (result.patient) setSelected(await getPatient(result.patient.id));
      await load();
    } catch (error) {
      setMessage(error.blockers ? `${error.message} (${error.blockers.join(" ")})` : error.message);
    }
  }

  const isActive = selected && !["checked_in", "no_show"].includes(selected.status);

  return (
    <div className="dashboard-grid">
      <section className="card">
        <div className="section-header">
          <div>
            <p className="eyebrow">Staff dashboard</p>
            <h2>Pre-arrival patients</h2>
          </div>
          <button className="secondary small" onClick={load}>Refresh</button>
        </div>

        <div className="table">
          {patients.map((patient) => (
            <div className="row" key={patient.id}>
              <span>
                <strong>{patient.name}</strong>
                <small>{new Date(patient.appointmentTime).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} · {patient.appointmentType}</small>
                <StatusBadges badges={patient.badges} />
              </span>
              <span>{patient.status}</span>
              <span>{patient.progress}%</span>
              {/* Spec §5.1: quick actions — Review, Verify, Follow Up, Check In */}
              <span className="row-actions">
                <button className="secondary small" onClick={() => selectPatient(patient.id)}>Review</button>
                <button
                  className="secondary small"
                  disabled={!patient.kioskData?.insuranceScan}
                  onClick={() => staffAction(() => verifyInsurance(patient.id), "Insurance verified.")}
                >
                  Verify
                </button>
                <button className="secondary small" onClick={() => staffAction(() => followUpPatient(patient.id), "Follow-up logged.")}>Follow Up</button>
                <button
                  className="small"
                  disabled={!patient.transferReadiness?.ready}
                  onClick={() => staffAction(() => checkInPatient(patient.id), "Checked in.")}
                >
                  Check In
                </button>
              </span>
            </div>
          ))}
        </div>

        <h3>No-show archive</h3>
        {archive.length === 0 && <p className="muted">No archived no-shows yet.</p>}
        {archive.map((patient) => (
          <div className="row" key={patient.id}>
            <span>
              <strong>{patient.name}</strong>
              <small>{patient.appointmentType} · {new Date(patient.appointmentTime).toLocaleDateString()}</small>
              <small>{patient.progress}% captured before no-show · DentVerify: {patient.dentverify?.status?.replace(/_/g, " ") || "not started"}</small>
            </span>
            <span>{patient.status}</span>
            <span>{patient.progress}%</span>
            {/* Spec §5.4 actions: Reschedule (reactivate) / Archive */}
            <span className="row-actions">
              <button className="secondary small" onClick={() => selectPatient(patient.id)}>Review</button>
              <button className="small" onClick={() => staffAction(() => reactivatePatient(patient.id), "Reactivated.")}>Reschedule</button>
              <button className="secondary small" onClick={() => staffAction(() => archivePatient(patient.id), "Record archived.")}>Archive</button>
            </span>
          </div>
        ))}
      </section>

      <section className="card">
        {!selected ? (
          <p className="muted">Select a patient to review kiosk intake and transfer options.</p>
        ) : (
          <>
            <p className="eyebrow">Patient profile</p>
            <h2>{selected.name}</h2>
            <p className="muted">DOB: {selected.dob} • Phone: {selected.phone}</p>
            <ProgressBadge value={selected.progress} status={selected.status} />
            <StatusBadges badges={selected.badges} />

            {selected.previouslyCollectedAt && (
              <p className="notice">Previously collected on {new Date(selected.previouslyCollectedAt).toLocaleDateString()} — confirm or re-collect as needed.</p>
            )}

            {selected.kioskReadiness && !selected.kioskReadiness.ready && (
              <div className="prompt-box">
                <p><strong>Patient still completing kiosk steps:</strong></p>
                <ul>
                  {selected.kioskReadiness.blockers.map((b) => <li key={b}>{b}</li>)}
                </ul>
              </div>
            )}

            <div className="panels">
              <article>
                <h3>
                  ID scan {selected.kioskData.idScan?.needsStaffReview && <span className="pill attention">Low confidence — review</span>}
                  {selected.kioskData.idScan?.zipOutOfServiceArea && <span className="pill attention">ZIP out of service area</span>}
                </h3>
                <pre>{JSON.stringify(selected.kioskData.idScan, null, 2)}</pre>
                <pre>{JSON.stringify(selected.kioskData.addressOverride, null, 2)}</pre>
              </article>
              <article>
                <h3>Insurance {selected.kioskData.insuranceScan?.entryMethod === "manual" && <span className="pill attention">Manual entry</span>}</h3>
                <pre>{JSON.stringify(selected.kioskData.insuranceScan, null, 2)}</pre>
              </article>
              <article>
                <h3>DentVerify benefits</h3>
                <BenefitsSummary dentverify={selected.dentverify} />
              </article>
              <article>
                <h3>PMS status</h3>
                <p>
                  {selected.pmsPatientId
                    ? <>Chart created — PMS ID <strong>{selected.pmsPatientId}</strong></>
                    : <span className="muted">Pending — chart will be created on arrival.</span>}
                </p>
              </article>
              <article>
                <h3>Consent forms</h3>
                {CONSENT_FORMS.map(({ key, label }) => {
                  const signature = selected.consentSignatures?.[key];
                  return (
                    <p key={key}>
                      {label}:{" "}
                      {signature
                        ? <a href={`${API_BASE_URL}${signature.documentUrl}`} target="_blank" rel="noreferrer">View PDF</a>
                        : "Not signed yet"}
                    </p>
                  );
                })}
              </article>
            </div>

            {isActive && (
              <div className="transfer-panel">
                <h3>Arrival & Transfer Panel</h3>
                <h4>Identity confirmation</h4>
                <IdentityConfirmation patient={selected} />
                <h4>Will be written to PMS on transfer</h4>
                <TransferManifest patient={selected} />
                <h3>Consent signatures (collect at check-in)</h3>
                {selected.kioskReadiness && !selected.kioskReadiness.ready ? (
                  <p className="muted">Patient is still completing kiosk steps — collect signatures once those are done.</p>
                ) : (
                  <StaffSignatureCapture patient={selected} onSigned={(updated) => { setSelected(updated); load(); }} />
                )}
              </div>
            )}

            <div className="action-row">
              <button onClick={() => staffAction(() => verifyInsurance(selected.id), "Insurance verified.")} disabled={!selected.kioskData.insuranceScan}>Re-verify insurance</button>
              {isActive && <button className="secondary" onClick={() => staffAction(() => followUpPatient(selected.id), "Follow-up logged.")}>Follow Up</button>}
              <button onClick={() => staffAction(() => checkInPatient(selected.id), "Checked in.")} disabled={!isActive}>Check In & Transfer to PMS</button>
              <button className="danger" onClick={() => staffAction(() => markNoShow(selected.id), "Marked no-show.")} disabled={!isActive}>Mark no-show</button>
              {selected.status === "no_show" && <button onClick={() => staffAction(() => reactivatePatient(selected.id), "Reactivated.")}>Reactivate</button>}
              {selected.status === "no_show" && <button className="secondary" onClick={() => staffAction(() => archivePatient(selected.id), "Record archived.")}>Archive</button>}
            </div>
          </>
        )}
        {message && <p className="notice">{message}</p>}
      </section>
    </div>
  );
}

export default function App() {
  const [view, setView] = useState("kiosk");

  return (
    <main>
      <nav className="top-nav">
        <div>
          <strong>DentComm Kiosk</strong>
          <span>Pre-arrival intake prototype</span>
        </div>
        <div className="nav-actions">
          <button className={view === "kiosk" ? "active" : "secondary"} onClick={() => setView("kiosk")}>Kiosk</button>
          <button className={view === "staff" ? "active" : "secondary"} onClick={() => setView("staff")}>Staff dashboard</button>
          <button className={view === "settings" ? "active" : "secondary"} onClick={() => setView("settings")}>Settings</button>
        </div>
      </nav>

      {view === "kiosk" ? <KioskFlow /> : view === "settings" ? <SettingsPanel /> : <StaffDashboard />}
    </main>
  );
}
