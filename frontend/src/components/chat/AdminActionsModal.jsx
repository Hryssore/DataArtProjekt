import { useState } from "react";

import { Modal } from "../ui/Modal.jsx";

export function MemberAdminModal({
  member,
  room,
  onClose,
  onPromote,
  onDemote,
  onRemove,
  onBan,
  busyActionKey = "",
}) {
  const [reason, setReason] = useState("");

  if (!member) {
    return null;
  }

  return (
    <Modal title={`Manage ${member.username}`} onClose={onClose}>
      <div className="stack">
        <p>
          Moderation actions are applied with a safe refresh afterward so the room state stays
          consistent.
        </p>
        {!member.isOwner ? (
          <>
            {member.isAdmin ? (
              <button
                type="button"
                className="ghost-button"
                onClick={() => onDemote(member)}
                disabled={busyActionKey === "demote"}
                aria-busy={busyActionKey === "demote"}
              >
                {busyActionKey === "demote" ? "Removing admin..." : "Remove admin"}
              </button>
            ) : room.isOwner ? (
              <button
                type="button"
                className="ghost-button"
                onClick={() => onPromote(member)}
                disabled={busyActionKey === "promote"}
                aria-busy={busyActionKey === "promote"}
              >
                {busyActionKey === "promote" ? "Granting..." : "Grant admin"}
              </button>
            ) : null}
            <button
              type="button"
              className="ghost-button danger-text"
              onClick={() => onRemove(member)}
              disabled={busyActionKey === "remove"}
              aria-busy={busyActionKey === "remove"}
            >
              {busyActionKey === "remove" ? "Removing..." : "Remove member"}
            </button>
            <input
              className="text-input"
              value={reason}
              onChange={event => setReason(event.target.value)}
              placeholder="Ban reason (optional)"
            />
            <button
              type="button"
              className="ghost-button danger-text"
              onClick={() => onBan(member, reason)}
              disabled={busyActionKey === "ban"}
              aria-busy={busyActionKey === "ban"}
            >
              {busyActionKey === "ban" ? "Banning..." : "Ban user"}
            </button>
          </>
        ) : (
          <p>{room.name} owner cannot be moderated here.</p>
        )}
      </div>
    </Modal>
  );
}

export function BansModal({ bans, onClose, onUnban, busyActionKey = "" }) {
  return (
    <Modal title="Banned users" onClose={onClose}>
      <div className="stack">
        {bans.map(ban => (
          <div key={ban.userId} className="member-row">
            <div>
              <strong>{ban.username}</strong>
              <p>{ban.reason || "No reason provided"}</p>
              <small>
                {ban.bannedBy?.username
                  ? `Banned by @${ban.bannedBy.username}`
                  : "Moderator unavailable"}
              </small>
            </div>
            <button
              type="button"
              className="ghost-button"
              onClick={() => onUnban(ban)}
              disabled={busyActionKey === `unban:${ban.userId}`}
              aria-busy={busyActionKey === `unban:${ban.userId}`}
            >
              {busyActionKey === `unban:${ban.userId}` ? "Unbanning..." : "Unban"}
            </button>
          </div>
        ))}
        {!bans.length ? <p>No banned users.</p> : null}
      </div>
    </Modal>
  );
}

export function ConfirmDeleteRoomModal({ roomName, onClose, onConfirm, isDeleting = false }) {
  return (
    <Modal title="Delete room" onClose={onClose}>
      <div className="stack">
        <p>
          Deleting <strong>{roomName}</strong> permanently removes its messages and files.
        </p>
        <button
          type="button"
          className="primary-button danger-button"
          onClick={onConfirm}
          disabled={isDeleting}
          aria-busy={isDeleting}
        >
          {isDeleting ? "Deleting room..." : "Delete room permanently"}
        </button>
      </div>
    </Modal>
  );
}
