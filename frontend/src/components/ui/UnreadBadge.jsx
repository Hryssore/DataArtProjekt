export function UnreadBadge({ count = 0 }) {
  if (!count) {
    return null;
  }

  return <span className="unread-badge">{count > 99 ? "99+" : count}</span>;
}
