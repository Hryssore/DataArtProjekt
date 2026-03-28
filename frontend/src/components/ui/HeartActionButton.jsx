import { HeartIcon } from "./SocialGlyphs.jsx";

export function HeartActionButton({
  liked = false,
  count = 0,
  isBusy = false,
  onClick,
  disabled = false,
  label = null,
  compact = false,
}) {
  const computedLabel = label ?? (liked ? "Unlike" : "Like");

  return (
    <button
      type="button"
      className={`heart-action-button ${liked ? "is-liked" : ""} ${compact ? "heart-action-button--compact" : ""}`.trim()}
      onClick={onClick}
      disabled={disabled}
      aria-busy={isBusy}
      title={disabled ? computedLabel : liked ? "Remove like" : "Like profile"}
    >
      <HeartIcon filled={liked} />
      {!compact ? <span>{computedLabel}</span> : null}
      <span>{count}</span>
    </button>
  );
}
