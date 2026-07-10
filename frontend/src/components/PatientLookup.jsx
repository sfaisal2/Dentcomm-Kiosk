import { useState } from "react";
import { lookupPatient } from "../lib/api";

export default function PatientLookup({ onFound }) {
  const [name, setName] = useState("Aisha Khan");
  const [dob, setDob] = useState("01/15/1998");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setLoading(true);
    setMessage("");

    try {
      const result = await lookupPatient({ name, dob, phone });
      setMessage(result.message);
      onFound(result.patient);
    } catch (error) {
      setMessage(error.message || "Please see the front desk.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="card kiosk-card">
      <p className="eyebrow">DentComm Kiosk</p>
      <h1>Welcome</h1>
      <p className="muted">Look up your appointment with name and date of birth, or phone number.</p>

      <form onSubmit={handleSubmit} className="form-grid">
        <label>
          Full name
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </label>

        <label>
          Date of birth
          <input placeholder="MM/DD/YYYY" value={dob} onChange={(e) => setDob(e.target.value)} />
        </label>

        <div className="divider">or</div>

        <label>
          Phone number
          <input placeholder="5551234567" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </label>

        <button type="submit" disabled={loading}>{loading ? "Searching..." : "Find my appointment"}</button>
      </form>

      {message && <p className="notice">{message}</p>}
    </section>
  );
}
