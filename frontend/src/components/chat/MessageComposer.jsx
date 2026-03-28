import { useEffect, useRef, useState } from "react";

const QUICK_EMOJIS = [
  "\u{1F642}",
  "\u{1F602}",
  "\u{1F60D}",
  "\u{1F525}",
  "\u{1F44F}",
  "\u{1F389}",
  "\u{1F91D}",
  "\u{1F60E}",
  "\u{2764}\u{FE0F}",
  "\u{1F44D}",
  "\u{1F62E}",
  "\u{1F622}",
];

function mergeUniqueFiles(currentFiles, incomingFiles) {
  const next = [...currentFiles];

  incomingFiles.forEach(file => {
    if (!file) {
      return;
    }

    if (
      !next.some(
        existing =>
          existing.name === file.name &&
          existing.size === file.size &&
          existing.lastModified === file.lastModified,
      )
    ) {
      next.push(file);
    }
  });

  return next;
}

function AttachmentButton({ disabled, onFiles }) {
  return (
    <label className="ghost-button composer__attach-button">
      <input
        type="file"
        multiple
        onChange={event => {
          onFiles(Array.from(event.target.files ?? []));
          event.target.value = "";
        }}
        disabled={disabled}
      />
      Attach
    </label>
  );
}

function GifButton({ disabled, onFiles }) {
  return (
    <label className="ghost-button composer__attach-button">
      <input
        type="file"
        accept="image/gif"
        multiple
        onChange={event => {
          onFiles(Array.from(event.target.files ?? []));
          event.target.value = "";
        }}
        disabled={disabled}
      />
      GIF
    </label>
  );
}

export function MessageComposer({
  onSend,
  replyTo = null,
  onCancelReply,
  disabled = false,
  placeholder = "Write a message",
  isSending = false,
  submitLabel = "Send",
  errorMessage = "",
  onTypingStateChange = null,
}) {
  const [body, setBody] = useState("");
  const [files, setFiles] = useState([]);
  const [attachmentComment, setAttachmentComment] = useState("");
  const [isEmojiPickerOpen, setIsEmojiPickerOpen] = useState(false);
  const typingTimeoutRef = useRef(null);
  const isTypingRef = useRef(false);

  function emitTypingState(nextIsTyping) {
    if (!onTypingStateChange || isTypingRef.current === nextIsTyping) {
      return;
    }

    isTypingRef.current = nextIsTyping;
    onTypingStateChange(nextIsTyping);
  }

  function stopTyping() {
    if (typingTimeoutRef.current) {
      window.clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }

    emitTypingState(false);
  }

  function scheduleTypingStop() {
    if (typingTimeoutRef.current) {
      window.clearTimeout(typingTimeoutRef.current);
    }

    typingTimeoutRef.current = window.setTimeout(() => {
      typingTimeoutRef.current = null;
      emitTypingState(false);
    }, 2500);
  }

  useEffect(() => {
    if (!disabled) {
      return undefined;
    }

    stopTyping();
    return undefined;
  }, [disabled]);

  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) {
        window.clearTimeout(typingTimeoutRef.current);
      }

      if (isTypingRef.current && onTypingStateChange) {
        onTypingStateChange(false);
      }
    };
  }, [onTypingStateChange]);

  async function handleSubmit(event) {
    event.preventDefault();
    if (disabled) {
      return;
    }

    if (!body.trim() && files.length === 0) {
      return;
    }

    const payload = {
      body,
      files,
      attachmentComment,
    };

    if (replyTo?.id) {
      payload.replyToMessageId = replyTo.id;
    }

    await onSend(payload);

    stopTyping();
    setBody("");
    setFiles([]);
    setAttachmentComment("");
    setIsEmojiPickerOpen(false);
  }

  function handleKeyDown(event) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  }

  function handlePaste(event) {
    const clipboardItems = Array.from(event.clipboardData?.items ?? []);
    const pastedFiles = clipboardItems
      .filter(item => item.kind === "file")
      .map(item => item.getAsFile())
      .filter(Boolean);

    if (!pastedFiles.length) {
      return;
    }

    event.preventDefault();
    setFiles(current => mergeUniqueFiles(current, pastedFiles));
  }

  function handleBodyChange(event) {
    const nextBody = event.target.value;
    setBody(nextBody);

    if (!onTypingStateChange) {
      return;
    }

    if (!nextBody.trim()) {
      stopTyping();
      return;
    }

    emitTypingState(true);
    scheduleTypingStop();
  }

  function handleAddFiles(nextFiles) {
    setFiles(current => mergeUniqueFiles(current, nextFiles));
  }

  function handleInsertEmoji(emoji) {
    setBody(current => `${current}${emoji}`);
    emitTypingState(true);
    scheduleTypingStop();
  }

  return (
    <form className="composer" onSubmit={handleSubmit}>
      {replyTo ? (
        <div className="reply-banner">
          <div>
            <strong>Replying to {replyTo.sender.username}</strong>
            <p>{replyTo.body || "[deleted]"}</p>
          </div>
          <button
            type="button"
            className="ghost-button"
            onClick={onCancelReply}
            disabled={disabled}
          >
            Cancel
          </button>
        </div>
      ) : null}

      <div className="composer__surface">
        <textarea
          value={body}
          onChange={handleBodyChange}
          onPaste={handlePaste}
          onKeyDown={handleKeyDown}
          onBlur={stopTyping}
          placeholder={placeholder}
          rows={3}
          disabled={disabled}
        />

        {isEmojiPickerOpen ? (
          <div className="composer__emoji-picker">
            {QUICK_EMOJIS.map(emoji => (
              <button
                key={emoji}
                type="button"
                className="composer__emoji-button"
                onClick={() => handleInsertEmoji(emoji)}
                disabled={disabled}
              >
                {emoji}
              </button>
            ))}
          </div>
        ) : null}

        {files.length ? (
          <>
            <div className="composer__files">
              {files.map(file => (
                <span key={`${file.name}-${file.size}`} className="attachment-chip">
                  {file.name}
                </span>
              ))}
            </div>
            <input
              className="text-input composer__attachment-comment"
              placeholder="Attachment comment (optional)"
              value={attachmentComment}
              onChange={event => setAttachmentComment(event.target.value)}
              disabled={disabled}
            />
          </>
        ) : null}

        <div className="composer__footer composer__footer--compact">
          <small>Enter to send, Shift+Enter for a new line.</small>
          <div className="inline-actions wrap-actions">
            <button
              type="button"
              className={`ghost-button ${isEmojiPickerOpen ? "is-selected" : ""}`}
              onClick={() => setIsEmojiPickerOpen(current => !current)}
              disabled={disabled}
            >
              Emoji
            </button>
            <GifButton disabled={disabled} onFiles={handleAddFiles} />
            <AttachmentButton disabled={disabled} onFiles={handleAddFiles} />
            <button
              type="submit"
              className="primary-button"
              disabled={disabled}
              aria-busy={isSending}
            >
              {submitLabel}
            </button>
          </div>
        </div>
      </div>
      {errorMessage ? <p className="error-text">{errorMessage}</p> : null}
    </form>
  );
}
