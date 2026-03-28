import { useEffect, useMemo, useRef, useState } from "react";

import { attachmentsApi } from "../../api/attachmentsApi.js";
import { messagesApi } from "../../api/messagesApi.js";
import { AvatarBadge } from "../ui/AvatarBadge.jsx";
import { formatDateTime } from "../../utils/date.js";
import { getLanguageLabel, normalizeLanguageCode } from "../../utils/languages.js";

const REACTION_OPTIONS = [
  "\u{2764}\u{FE0F}",
  "\u{1F44D}",
  "\u{1F602}",
  "\u{1F525}",
  "\u{1F389}",
  "\u{1F62E}",
];

function AttachmentImagePreview({ attachment }) {
  const [previewUrl, setPreviewUrl] = useState("");
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    let isActive = true;
    let objectUrl = "";

    attachmentsApi
      .fetchPreviewBlob(attachment.id)
      .then(blob => {
        if (!isActive) {
          return;
        }

        objectUrl = URL.createObjectURL(blob);
        setPreviewUrl(objectUrl);
        setHasError(false);
      })
      .catch(() => {
        if (!isActive) {
          return;
        }

        setPreviewUrl("");
        setHasError(true);
      });

    return () => {
      isActive = false;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [attachment.id]);

  if (hasError) {
    return (
      <a
        className="attachment-media-card"
        href={attachmentsApi.downloadUrl(attachment.id)}
        target="_blank"
        rel="noreferrer"
      >
        <div className="attachment-media-card__fallback">
          <strong>Preview unavailable</strong>
          <span>Open image</span>
        </div>
        <span className="attachment-media-card__label">{attachment.originalName}</span>
      </a>
    );
  }

  return (
    <a
      className="attachment-media-card"
      href={attachmentsApi.downloadUrl(attachment.id)}
      target="_blank"
      rel="noreferrer"
    >
      {previewUrl ? (
        <img
          className="attachment-media-card__image"
          src={previewUrl}
          alt={attachment.originalName}
          loading="lazy"
        />
      ) : (
        <div className="attachment-media-card__fallback">
          <strong>Loading image...</strong>
        </div>
      )}
      <span className="attachment-media-card__label">{attachment.originalName}</span>
    </a>
  );
}

export function MessageList({
  messages,
  currentUserId,
  hasMore,
  isLoading,
  onLoadOlder,
  onReply,
  onEdit,
  onDelete,
  onOpenProfile = null,
  canModerate = false,
  translationTargetLanguage = "",
}) {
  const viewportRef = useRef(null);
  const shouldStickToBottomRef = useRef(true);
  const pendingPrependRef = useRef(null);
  const previousFirstIdRef = useRef(null);
  const [translations, setTranslations] = useState({});
  const [openReactionPickerMessageId, setOpenReactionPickerMessageId] = useState(null);
  const [openProfileMenuMessageId, setOpenProfileMenuMessageId] = useState(null);
  const [reactionBusyKey, setReactionBusyKey] = useState("");
  const normalizedTargetLanguage = normalizeLanguageCode(translationTargetLanguage);
  const targetLanguageLabel = getLanguageLabel(normalizedTargetLanguage);

  const sortedMessages = useMemo(() => messages, [messages]);

  useEffect(() => {
    setTranslations({});
  }, [normalizedTargetLanguage]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) {
      return;
    }

    if (pendingPrependRef.current && sortedMessages[0]?.id !== previousFirstIdRef.current) {
      const diff = viewport.scrollHeight - pendingPrependRef.current.previousHeight;
      viewport.scrollTop = pendingPrependRef.current.previousScrollTop + diff;
      pendingPrependRef.current = null;
      previousFirstIdRef.current = sortedMessages[0]?.id ?? null;
      return;
    }

    if (shouldStickToBottomRef.current) {
      viewport.scrollTop = viewport.scrollHeight;
    }

    previousFirstIdRef.current = sortedMessages[0]?.id ?? null;
  }, [sortedMessages]);

  function triggerLoadOlder() {
    const viewport = viewportRef.current;
    if (!viewport || !hasMore || isLoading) {
      return;
    }

    pendingPrependRef.current = {
      previousHeight: viewport.scrollHeight,
      previousScrollTop: viewport.scrollTop,
    };
    previousFirstIdRef.current = sortedMessages[0]?.id ?? null;
    Promise.resolve(onLoadOlder()).catch(() => {
      pendingPrependRef.current = null;
    });
  }

  function handleScroll() {
    const viewport = viewportRef.current;
    if (!viewport) {
      return;
    }

    const distanceFromBottom =
      viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
    shouldStickToBottomRef.current = distanceFromBottom < 120;

    if (viewport.scrollTop < 64 && hasMore && !isLoading) {
      triggerLoadOlder();
    }
  }

  async function handleToggleTranslation(message) {
    const currentTranslation = translations[message.id];
    if (currentTranslation?.translatedText) {
      setTranslations(current => ({
        ...current,
        [message.id]: {
          ...currentTranslation,
          isVisible: !currentTranslation.isVisible,
        },
      }));
      return;
    }

    setTranslations(current => ({
      ...current,
      [message.id]: {
        isLoading: true,
        error: "",
        isVisible: false,
      },
    }));

    try {
      const result = await messagesApi.translate(message.id, {
        targetLanguage: normalizedTargetLanguage || null,
      });

      setTranslations(current => ({
        ...current,
        [message.id]: {
          ...result.translation,
          isLoading: false,
          error: "",
          isVisible: true,
        },
      }));
    } catch (error) {
      setTranslations(current => ({
        ...current,
        [message.id]: {
          isLoading: false,
          error: error.message,
          isVisible: false,
        },
      }));
    }
  }

  async function handleToggleReaction(message, reaction) {
    const hasCurrentReaction = (message.reactions ?? []).some(
      item => item.reaction === reaction && item.reactedUserIds?.includes(currentUserId),
    );

    try {
      setReactionBusyKey(`${message.id}:${reaction}`);
      if (hasCurrentReaction) {
        await messagesApi.removeReaction(message.id, reaction);
      } else {
        await messagesApi.addReaction(message.id, reaction);
      }
      setOpenReactionPickerMessageId(null);
    } catch (_error) {
      return;
    } finally {
      setReactionBusyKey("");
    }
  }

  return (
    <div className="message-list" ref={viewportRef} onScroll={handleScroll}>
      {hasMore ? (
        <button type="button" className="ghost-button load-older" onClick={triggerLoadOlder}>
          {isLoading ? "Loading..." : "Load older history"}
        </button>
      ) : null}

      {sortedMessages.map(message => {
        const isOwn = message.sender.id === currentUserId;
        const translation = translations[message.id];
        const reactions = message.reactions ?? [];
        const imageAttachments = (message.attachments ?? []).filter(attachment => attachment.isImage);
        const fileAttachments = (message.attachments ?? []).filter(attachment => !attachment.isImage);
        const senderName = message.sender.displayName || message.sender.username;
        const showUsername = senderName !== message.sender.username;
        const canTranslate =
          Boolean(normalizedTargetLanguage) && !message.isDeleted && Boolean(message.body?.trim());
        return (
          <article key={message.id} className={`message-card ${isOwn ? "is-own" : ""}`}>
            {!message.isDeleted ? (
              <button
                type="button"
                className={`message-card__react-toggle ${openReactionPickerMessageId === message.id ? "is-selected" : ""} ${isOwn ? "is-own" : ""}`.trim()}
                onClick={() =>
                  setOpenReactionPickerMessageId(current =>
                    current === message.id ? null : message.id,
                  )
                }
                aria-label="Open reactions"
                title="React"
              >
                +
              </button>
            ) : null}

            <div className="message-card__header">
              <AvatarBadge user={message.sender} size="sm" />
              <div className="message-card__sender-copy">
                <div className="message-card__meta">
                  <div className="message-author-menu">
                    <button
                      type="button"
                      className="message-author-trigger"
                      onClick={() =>
                        setOpenProfileMenuMessageId(current =>
                          current === message.id ? null : message.id,
                        )
                      }
                    >
                      <strong>{senderName}</strong>
                      {showUsername ? <span className="pill">@{message.sender.username}</span> : null}
                    </button>
                    {openProfileMenuMessageId === message.id && onOpenProfile ? (
                      <div className="message-author-menu__card">
                        <button
                          type="button"
                          className="ghost-button ghost-button--xs"
                          onClick={() => {
                            setOpenProfileMenuMessageId(null);
                            onOpenProfile(message.sender);
                          }}
                        >
                          View profile
                        </button>
                      </div>
                    ) : null}
                  </div>
                  <span>{formatDateTime(message.createdAt)}</span>
                  {message.isEdited ? <span className="muted-label">edited</span> : null}
                  {message.isDeleted ? <span className="muted-label">deleted</span> : null}
                </div>
              </div>
            </div>

            {message.replyTo ? (
              <div className="reply-preview">
                <strong>{message.replyTo.senderDisplayName || message.replyTo.senderUsername}</strong>
                <p>{message.replyTo.body || "[deleted]"}</p>
              </div>
            ) : null}

            <div className="message-card__body">
              {message.isDeleted ? "[message deleted]" : message.body || ""}
            </div>

            {translation?.isVisible && translation?.translatedText ? (
              <div className="message-translation">
                <div className="message-translation__meta">
                  <strong>Translated to {translation.targetLanguageLabel || targetLanguageLabel}</strong>
                  {translation.detectedSourceLanguageLabel ? (
                    <span>from {translation.detectedSourceLanguageLabel}</span>
                  ) : null}
                </div>
                <div className="message-card__body">{translation.translatedText}</div>
              </div>
            ) : null}

            {translation?.error ? <p className="error-text">{translation.error}</p> : null}

            {imageAttachments.length ? (
              <div className="attachment-media-grid">
                {imageAttachments.map(attachment => (
                  <div key={attachment.id} className="stack compact-stack">
                    <AttachmentImagePreview attachment={attachment} />
                    {attachment.comment ? (
                      <small className="muted-label">{attachment.comment}</small>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : null}

            {fileAttachments.length ? (
              <div className="attachment-list">
                {fileAttachments.map(attachment => (
                  <div key={attachment.id} className="stack compact-stack">
                    <a
                      className="attachment-chip"
                      href={attachmentsApi.downloadUrl(attachment.id)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {attachment.originalName}
                    </a>
                    {attachment.comment ? (
                      <small className="muted-label">{attachment.comment}</small>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : null}

            {!message.isDeleted ? (
              <div className="message-reactions">
                {reactions.map(item => {
                  const isSelected = item.reactedUserIds?.includes(currentUserId);
                  return (
                    <button
                      key={`${message.id}-${item.reaction}`}
                      type="button"
                      className={`reaction-chip ${isSelected ? "is-selected" : ""}`}
                      onClick={() => handleToggleReaction(message, item.reaction)}
                      disabled={reactionBusyKey === `${message.id}:${item.reaction}`}
                      aria-busy={reactionBusyKey === `${message.id}:${item.reaction}`}
                    >
                      <span>{item.reaction}</span>
                      <strong>{item.count}</strong>
                    </button>
                  );
                })}
              </div>
            ) : null}

            {openReactionPickerMessageId === message.id && !message.isDeleted ? (
              <div className="message-reaction-picker">
                {REACTION_OPTIONS.map(reaction => (
                  <button
                    key={`${message.id}-picker-${reaction}`}
                    type="button"
                    className="message-reaction-picker__button"
                    onClick={() => handleToggleReaction(message, reaction)}
                    disabled={reactionBusyKey === `${message.id}:${reaction}`}
                    aria-busy={reactionBusyKey === `${message.id}:${reaction}`}
                  >
                    {reaction}
                  </button>
                ))}
              </div>
            ) : null}

            <div className="message-card__actions">
              <button type="button" className="ghost-button ghost-button--xs" onClick={() => onReply(message)}>
                Reply
              </button>
              {canTranslate ? (
                <button
                  type="button"
                  className={`ghost-button ghost-button--xs ${translation?.isVisible ? "is-selected" : ""}`}
                  onClick={() => handleToggleTranslation(message)}
                  disabled={translation?.isLoading}
                  aria-busy={translation?.isLoading}
                >
                  {translation?.isLoading
                    ? "Translating..."
                    : translation?.translatedText
                      ? translation.isVisible
                        ? "Original"
                        : "Translate"
                      : "Translate"}
                </button>
              ) : null}
              {isOwn ? (
                <>
                  <button type="button" className="ghost-button ghost-button--xs" onClick={() => onEdit(message)}>
                    Edit
                  </button>
                  <button type="button" className="ghost-button ghost-button--xs danger-text" onClick={() => onDelete(message)}>
                    Delete
                  </button>
                </>
              ) : null}
              {!isOwn && canModerate ? (
                <button type="button" className="ghost-button ghost-button--xs danger-text" onClick={() => onDelete(message)}>
                  Delete
                </button>
              ) : null}
            </div>
          </article>
        );
      })}
    </div>
  );
}
