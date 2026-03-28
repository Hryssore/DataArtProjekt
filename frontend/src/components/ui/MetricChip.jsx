export function MetricChip({ icon, value, label, tone = "default", className = "" }) {
  return (
    <span className={`metric-chip metric-chip--${tone} ${className}`.trim()} title={label}>
      <span className="metric-chip__icon" aria-hidden="true">
        {icon}
      </span>
      <span className="metric-chip__label">{value}</span>
    </span>
  );
}
