import { useEffect, useState } from "react";

import { AvatarBadge } from "../ui/AvatarBadge.jsx";
import { Modal } from "../ui/Modal.jsx";

export function MessageEditModal({
  message,
  onClose,
  onSubmit,
  isSaving = false,
  errorMessage = "",
}) {
  const [draft, setDraft] = useState(message?.body ?? "");

  useEffect(() => {
    setDraft(message?.body ?? "");
  }, [message?.body, message?.id]);

  function handleSubmit(event) {
    event.preventDefault();
    onSubmit(draft);
  }

  return (
    <Modal title="Edit message" onClose={onClose}>
      <form className="stack" onSubmit={handleSubmit}>
        <div className="message-edit-modal__author">
          <AvatarBadge user={message.sender} size="md" />
          <div className="stack compact-stack">
            <strong>{message.sender.displayName || message.sender.username}</strong>
            <small>@{message.sender.username}</small>
          </div>
        </div>

        <textarea
          className="text-input message-edit-modal__textarea"
          rows={6}
          value={draft}
          onChange={event => setDraft(event.target.value)}
          placeholder="Update your message"
          autoFocus
        />

        <small>Shift+Enter adds a new line. Save will update the message for everyone.</small>

        {errorMessage ? <p className="error-text">{errorMessage}</p> : null}

        <div className="inline-actions wrap-actions modal-card__actions">
          <button
            type="submit"
            className="primary-button"
            disabled={isSaving}
            aria-busy={isSaving}
          >
            {isSaving ? "Saving..." : "Save changes"}
          </button>
          <button type="button" className="ghost-button" onClick={onClose} disabled={isSaving}>
            Cancel
          </button>
        </div>
      </form>
    </Modal>
  );
}
