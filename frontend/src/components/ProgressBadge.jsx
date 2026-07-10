export default function ProgressBadge({ value = 0, status }) {
  return (
    <div className="progress-wrap">
      <div className="progress-header">
        <span>{status}</span>
        <strong>{value}%</strong>
      </div>
      <div className="progress-bar">
        <div className="progress-fill" style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}
