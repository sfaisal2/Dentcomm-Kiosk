import { useEffect, useState } from "react";
import PatientLookup from "./components/PatientLookup";
import ProgressBadge from "./components/ProgressBadge";
import {
  captureSignature,
  checkInPatient,
  getNoShowArchive,
  getPatient,
  getPreArrivalPatients,
  markNoShow,
  reactivatePatient,
  scanId,
  scanInsurance,
  verifyInsurance
} from "./lib/api";
import "./styles.css";

function StepButton({ children, onClick, disabled }) {
  return <button className="secondary" onClick={onClick} disabled={disabled}>{children}</button>;
}

function KioskFlow() {
  const [patient, setPatient] = useState(null);
  const [message, setMessage] = useState("");

  async function runStep(action, successMessage) {
    try {
      const updated = await action();
      setPatient(updated);
      setMessage(successMessage);
    } catch (error) {
      setMessage(error.message);
    }
  }

  if (!patient) return <PatientLookup onFound={setPatient} />;

  return (
    <section className="card kiosk-card">
      <p className="eyebrow">Patient-facing kiosk</p>
      <h1>Hello, {patient.name}</h1>
      <p className="muted">Appointment: {new Date(patient.appointmentTime).toLocaleString()} with {patient.providerName}</p>
      <ProgressBadge value={patient.progress} status={patient.status} />

      <div className="step-list">
        <div className="step">
          <h3>1. Government ID scan</h3>
          <p>Mock OCR extracts legal name, DOB, address, ID number, and issue date.</p>
          <StepButton onClick={() => runStep(() => scanId(patient.id), "ID scan saved.")}>Run mock ID scan</StepButton>
        </div>

        <div className="step">
          <h3>2. Insurance card scan</h3>
          <p>Mock OCR extracts carrier, member ID, group number, plan type, and payer ID.</p>
          <StepButton onClick={() => runStep(() => scanInsurance(patient.id), "Insurance scan saved.")} disabled={!patient.kioskData?.idScan}>Run mock insurance scan</StepButton>
        </div>

        <div className="step">
          <h3>3. Consent signatures</h3>
          <p>In the real app this would open a signature pad. For now, it saves mock signatures.</p>
          <StepButton onClick={() => runStep(async () => {
            await captureSignature(patient.id, "financialPolicy");
            return captureSignature(patient.id, "treatmentConsent");
          }, "Required signatures captured.")} disabled={!patient.kioskData?.insuranceScan}>Capture mock signatures</StepButton>
        </div>
      </div>

      {message && <p className="notice">{message}</p>}
      <button className="link-button" onClick={() => setPatient(null)}>Back to lookup</button>
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
      if (result.patient) setSelected(result.patient);
      await load();
    } catch (error) {
      setMessage(error.message);
    }
  }

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
            <button className="row" key={patient.id} onClick={() => selectPatient(patient.id)}>
              <span><strong>{patient.name}</strong><small>{patient.appointmentType}</small></span>
              <span>{patient.status}</span>
              <span>{patient.progress}%</span>
            </button>
          ))}
        </div>

        <h3>No-show archive</h3>
        {archive.length === 0 && <p className="muted">No archived no-shows yet.</p>}
        {archive.map((patient) => (
          <button className="row" key={patient.id} onClick={() => selectPatient(patient.id)}>
            <span><strong>{patient.name}</strong><small>No PMS chart created</small></span>
            <span>{patient.status}</span>
            <span>{patient.progress}%</span>
          </button>
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

            <div className="panels">
              <article>
                <h3>ID scan</h3>
                <pre>{JSON.stringify(selected.kioskData.idScan, null, 2)}</pre>
              </article>
              <article>
                <h3>Insurance</h3>
                <pre>{JSON.stringify(selected.kioskData.insuranceScan, null, 2)}</pre>
              </article>
              <article>
                <h3>DentVerify</h3>
                <pre>{JSON.stringify(selected.dentverify, null, 2)}</pre>
              </article>
            </div>

            <div className="action-row">
              <button onClick={() => staffAction(() => verifyInsurance(selected.id), "Insurance verified.")} disabled={!selected.kioskData.insuranceScan}>Run DentVerify</button>
              <button onClick={() => staffAction(() => checkInPatient(selected.id), "Checked in.")} disabled={selected.status === "checked_in" || selected.status === "no_show"}>Check In & Transfer to PMS</button>
              <button className="danger" onClick={() => staffAction(() => markNoShow(selected.id), "Marked no-show.")} disabled={selected.status === "checked_in" || selected.status === "no_show"}>Mark no-show</button>
              {selected.status === "no_show" && <button onClick={() => staffAction(() => reactivatePatient(selected.id), "Reactivated.")}>Reactivate</button>}
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
        </div>
      </nav>

      {view === "kiosk" ? <KioskFlow /> : <StaffDashboard />}
    </main>
  );
}
