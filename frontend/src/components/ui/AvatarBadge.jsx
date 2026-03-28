import { getAvatarLook } from "../../utils/avatarPresets.js";

const DECORATION_LOOKS = {
  "ring-sunrise": "#c35f2c",
  "ring-aurora": "#4b8f76",
  "ring-royal": "#8065b2",
  heartflare: "#d45454",
};

export function AvatarBadge({
  user,
  size = "md",
  showLevel = true,
  title = null,
}) {
  const decorationKey = user?.decorationKey ?? "ring-sunrise";
  const avatar = getAvatarLook(user);
  const accent = DECORATION_LOOKS[decorationKey] ?? DECORATION_LOOKS["ring-sunrise"];

  return (
    <div
      className={`avatar-badge avatar-badge--${size}`}
      style={{
        "--avatar-ring": accent,
        "--avatar-bg": avatar.background,
      }}
      title={title ?? avatar.label}
    >
      <div className="avatar-badge__inner">
        <span className="avatar-badge__glyph">{avatar.glyph}</span>
      </div>
      {showLevel ? <span className="avatar-badge__level">Lv {user?.level ?? 1}</span> : null}
    </div>
  );
}
