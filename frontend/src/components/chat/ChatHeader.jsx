import { PresencePill } from "../ui/PresencePill.jsx";

export function ChatHeader({
  title,
  subtitle,
  presence,
  extra = null,
  activity = null,
  actions = null,
}) {
  return (
    <div className="chat-header">
      <div className="chat-header__copy">
        <h1>{title}</h1>
        <p>{subtitle}</p>
        {activity ? <div className="chat-header__activity">{activity}</div> : null}
      </div>
      <div className="chat-header__meta">
        {presence ? <PresencePill status={presence} /> : null}
        {actions}
        {extra}
      </div>
    </div>
  );
}
