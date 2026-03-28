export function HeartIcon({ filled = false, className = "" }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={`social-glyph ${filled ? "is-filled" : ""} ${className}`.trim()}
    >
      <path
        d="M12 20.4 4.9 13.8a4.7 4.7 0 0 1 0-6.8 4.8 4.8 0 0 1 6.8 0L12 7.3l.3-.3a4.8 4.8 0 0 1 6.8 6.8L12 20.4Z"
        fill={filled ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function TrophyIcon({ className = "" }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={`social-glyph ${className}`.trim()}
    >
      <path
        d="M8 4.5h8v2.2a4 4 0 0 0 2.7 3.8l.8.3a3.4 3.4 0 0 1-2.7 3.3l-1 .2a5.1 5.1 0 0 1-3.5 2.6v2.4h3.1v1.8H8.6v-1.8h3.1v-2.4a5.1 5.1 0 0 1-3.5-2.6l-1-.2a3.4 3.4 0 0 1-2.7-3.3l.8-.3A4 4 0 0 0 8 6.7V4.5Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M8 7H5.4A2.4 2.4 0 0 0 3 9.4c0 1.7 1.3 3 3 3H7"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M16 7h2.6A2.4 2.4 0 0 1 21 9.4c0 1.7-1.3 3-3 3H17"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}
