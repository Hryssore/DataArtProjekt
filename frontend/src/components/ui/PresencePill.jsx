export function PresencePill({ status = "offline" }) {
  return (
    <span className={`presence-pill presence-pill--${status}`} title={status}>
      <span className="presence-pill__dot" />
      {status}
    </span>
  );
}
