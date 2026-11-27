const STATUS_STYLES = {
  Normal: "bg-success-bg text-success-text border-success-border",
  Reviewed: "bg-success-bg text-success-text border-success-border",
  Active: "bg-success-bg text-success-text border-success-border",
  Monitor: "bg-warning-bg text-warning-text border-warning-border",
  "Pending Review": "bg-warning-bg text-warning-text border-warning-border",
  "Follow-up": "bg-info-bg text-info-text border-info-border",
  "Follow-up Scheduled": "bg-info-bg text-info-text border-info-border",
  "Elevated Risk": "bg-danger-bg text-danger-text border-danger-border",
  Inactive: "bg-surface-muted text-secondary border-border",
};

export default function StatusBadge({ status }) {
  if (!status) {
    return <span className="text-sm text-muted">—</span>;
  }

  const tone =
    STATUS_STYLES[status] || "bg-surface-muted text-secondary border-border";

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 text-xs font-semibold border rounded-[3px] whitespace-nowrap ${tone}`}
    >
      {status}
    </span>
  );
}
