import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useOutletContext, useParams } from "react-router-dom";

import { attachmentsApi } from "../api/attachmentsApi.js";
import { dialogsApi } from "../api/dialogsApi.js";
import { messagesApi } from "../api/messagesApi.js";
import { ChatHeader } from "../components/chat/ChatHeader.jsx";
import { MessageEditModal } from "../components/chat/MessageEditModal.jsx";
import { MessageComposer } from "../components/chat/MessageComposer.jsx";
import { MessageList } from "../components/chat/MessageList.jsx";
import { AvatarBadge } from "../components/ui/AvatarBadge.jsx";
import { EmptyState } from "../components/ui/EmptyState.jsx";
import { PresencePill } from "../components/ui/PresencePill.jsx";
import { UnreadBadge } from "../components/ui/UnreadBadge.jsx";
import { useInfiniteMessages } from "../hooks/useInfiniteMessages.js";
import { useSocket } from "../socket/SocketProvider.jsx";

export function DialogChatPage() {
  const { dialogId } = useParams();
  const navigate = useNavigate();
  const workspace = useOutletContext();
  const { socket } = useSocket();
  const [dialog, setDialog] = useState(null);
  const [replyTo, setReplyTo] = useState(null);
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [composerError, setComposerError] = useState("");
  const [editingMessage, setEditingMessage] = useState(null);
  const [isSavingEditedMessage, setIsSavingEditedMessage] = useState(false);
  const [editMessageError, setEditMessageError] = useState("");
  const [isOpeningFriendDialog, setIsOpeningFriendDialog] = useState("");
  const [isDeletingDialog, setIsDeletingDialog] = useState(false);

  const dialogHistoryLoader = useCallback(
    query => messagesApi.listDialog(dialogId, { limit: 30, ...query }),
    [dialogId],
  );

  const messageFeed = useInfiniteMessages(dialogHistoryLoader);

  const mergeMessage = useCallback((currentMessages, nextMessage) => {
    const exists = currentMessages.some(message => message.id === nextMessage.id);
    if (exists) {
      return currentMessages.map(message =>
        message.id === nextMessage.id ? nextMessage : message,
      );
    }

    return [...currentMessages, nextMessage];
  }, []);

  const mergeAttachments = useCallback((currentMessages, event) => {
    return currentMessages.map(message => {
      if (message.id !== event.messageId) {
        return message;
      }

      const currentAttachments = message.attachments ?? [];
      const nextAttachments = [...currentAttachments];

      event.attachments.forEach(attachment => {
        if (!nextAttachments.some(item => item.id === attachment.id)) {
          nextAttachments.push(attachment);
        }
      });

      return {
        ...message,
        attachments: nextAttachments,
      };
    });
  }, []);

  const loadDialog = useCallback(async () => {
    const result = await dialogsApi.getById(dialogId);
    setDialog(result.dialog);
  }, [dialogId]);

  useEffect(() => {
    loadDialog().catch(() => navigate("/friends"));
  }, [loadDialog, navigate]);

  useEffect(() => {
    if (socket) {
      socket.emit("dialog:subscribe", { dialogId });
    }
  }, [dialogId, socket]);

  useEffect(() => {
    if (!socket) {
      return;
    }

    function handleCreated(event) {
      if (event.dialogId === dialogId) {
        messageFeed.setMessages(current => mergeMessage(current, event.message));
        setDialog(current =>
          current
            ? {
                ...current,
                messageCount: (current.messageCount ?? 0) + 1,
              }
            : current,
        );
      }
    }

    function handleUpdated(event) {
      if (event.dialogId === dialogId) {
        messageFeed.setMessages(current =>
          current.map(message => (message.id === event.message.id ? event.message : message)),
        );
      }
    }

    function handleDeleted(event) {
      if (event.dialogId === dialogId) {
        messageFeed.setMessages(current =>
          current.map(message => (message.id === event.message.id ? event.message : message)),
        );
        setDialog(current =>
          current
            ? {
                ...current,
                messageCount: Math.max(0, (current.messageCount ?? 0) - 1),
              }
            : current,
        );
      }
    }

    function handleAttachments(event) {
      if (event.dialogId === dialogId) {
        messageFeed.setMessages(current => mergeAttachments(current, event));
      }
    }

    function handlePresenceUpdate() {
      loadDialog().catch(() => undefined);
    }

    socket.on("message:created", handleCreated);
    socket.on("message:updated", handleUpdated);
    socket.on("message:deleted", handleDeleted);
    socket.on("message:attachments-added", handleAttachments);
    socket.on("presence:update", handlePresenceUpdate);

    return () => {
      socket.off("message:created", handleCreated);
      socket.off("message:updated", handleUpdated);
      socket.off("message:deleted", handleDeleted);
      socket.off("message:attachments-added", handleAttachments);
      socket.off("presence:update", handlePresenceUpdate);
    };
  }, [dialogId, loadDialog, mergeAttachments, mergeMessage, messageFeed.setMessages, socket]);

  useEffect(() => {
    const lastMessage = messageFeed.messages.at(-1);
    if (!lastMessage) {
      return;
    }

    messagesApi.markDialogRead(dialogId, { lastReadMessageId: lastMessage.id }).catch(() => undefined);
  }, [dialogId, messageFeed.messages]);

  const dialogUnreadMap = useMemo(
    () => new Map((workspace.unread?.dialogs ?? []).map(item => [item.dialogId, item.unreadCount])),
    [workspace.unread?.dialogs],
  );

  const sortedFriends = useMemo(() => {
    const statusOrder = { online: 0, afk: 1, offline: 2 };
    return [...(workspace.friends ?? [])].sort((left, right) => {
      const leftRank = statusOrder[left.status] ?? 3;
      const rightRank = statusOrder[right.status] ?? 3;
      if (leftRank !== rightRank) {
        return leftRank - rightRank;
      }

      return (left.displayName || left.username).localeCompare(right.displayName || right.username);
    });
  }, [workspace.friends]);

  const onlineFriends = useMemo(
    () => sortedFriends.filter(friend => friend.status !== "offline"),
    [sortedFriends],
  );

  const offlineFriends = useMemo(
    () => sortedFriends.filter(friend => friend.status === "offline"),
    [sortedFriends],
  );

  async function handleSend(payload) {
    setIsSendingMessage(true);
    setComposerError("");
    try {
      const result = await messagesApi.sendDialog(dialogId, {
        body: payload.body,
        ...(payload.replyToMessageId ? { replyToMessageId: payload.replyToMessageId } : {}),
      });

      let nextMessage = result.message;
      messageFeed.setMessages(current => mergeMessage(current, nextMessage));
      setReplyTo(null);
      workspace.refreshWorkspace();

      if (payload.files.length) {
        try {
          const uploadResult = await attachmentsApi.upload(
            result.message.id,
            payload.files,
            payload.attachmentComment ?? "",
          );
          nextMessage = {
            ...nextMessage,
            attachments: uploadResult.attachments,
          };
          messageFeed.setMessages(current => mergeMessage(current, nextMessage));
        } catch (error) {
          setComposerError(error.message || "Message sent, but attachments could not be uploaded.");
        }
      }
    } catch (error) {
      setComposerError(error.message || "Message could not be sent.");
    } finally {
      setIsSendingMessage(false);
    }
  }

  async function handleEdit(message) {
    setEditMessageError("");
    setEditingMessage(message);
  }

  async function handleSaveEditedMessage(body) {
    if (!editingMessage) {
      return;
    }

    setIsSavingEditedMessage(true);
    setEditMessageError("");

    try {
      const result = await messagesApi.update(editingMessage.id, { body });
      messageFeed.setMessages(current =>
        current.map(item => (item.id === editingMessage.id ? result.message : item)),
      );
      setEditingMessage(null);
    } catch (error) {
      setEditMessageError(error.message || "Message could not be updated.");
    } finally {
      setIsSavingEditedMessage(false);
    }
  }

  async function handleDelete(message) {
    const result = await messagesApi.remove(message.id);
    messageFeed.setMessages(current =>
      current.map(item => (item.id === message.id ? result.message : item)),
    );
  }

  async function handleOpenFriendDialog(friend) {
    setIsOpeningFriendDialog(friend.id);
    try {
      const nextDialogId = friend.dialogId;
      if (nextDialogId) {
        navigate(`/dialogs/${nextDialogId}`);
        return;
      }

      const result = await dialogsApi.getOrCreateWithUser(friend.id);
      await workspace.refreshWorkspace();
      navigate(`/dialogs/${result.dialog.id}`);
    } finally {
      setIsOpeningFriendDialog("");
    }
  }

  async function handleDeleteDialog() {
    setIsDeletingDialog(true);
    try {
      await dialogsApi.remove(dialogId);
      await workspace.refreshWorkspace();
      navigate("/friends");
    } finally {
      setIsDeletingDialog(false);
    }
  }

  function handleBack() {
    navigate("/friends");
  }

  if (!dialog) {
    return <div className="screen-center">Loading dialog...</div>;
  }

  return (
    <div className="chat-workspace dialog-workspace dialog-workspace--focused">
      <section className="chat-panel">
        <ChatHeader
          title={dialog.otherUser.displayName || dialog.otherUser.username}
          subtitle="Private channel"
          activity={
            <div className="inline-actions wrap-actions">
              <span>{dialog.messageCount ?? 0} messages</span>
              {dialog.isFrozen ? <span className="chat-header__separator">|</span> : null}
              {dialog.isFrozen ? <span className="chat-header__typing">Read-only history</span> : null}
            </div>
          }
          actions={null}
          presence={null}
          extra={
            <div className="dialog-chat-header__friend dialog-chat-header__friend--stacked">
              <AvatarBadge user={dialog.otherUser} size="sm" showLevel={false} />
              <div className="dialog-chat-header__friend-copy">
                <span className="stat-chip">@{dialog.otherUser.username}</span>
                <PresencePill status={dialog.otherUser.status} />
              </div>
            </div>
          }
        />

        {!dialog.canWrite ? (
          <div className="warning-banner">
            New personal messages are blocked because the friendship no longer allows writing or a
            user ban froze this dialog.
          </div>
        ) : null}

        <MessageList
          messages={messageFeed.messages}
          currentUserId={workspace.currentUser?.id}
          translationTargetLanguage={workspace.currentUser?.preferredLanguage}
          hasMore={messageFeed.hasMore}
          isLoading={messageFeed.isLoading}
          onLoadOlder={messageFeed.loadMore}
          onReply={setReplyTo}
          onEdit={handleEdit}
          onDelete={handleDelete}
          onOpenProfile={sender => navigate(`/users/${sender.id}`)}
        />

        <MessageComposer
          onSend={handleSend}
          replyTo={replyTo}
          onCancelReply={() => setReplyTo(null)}
          disabled={!dialog.canWrite || isSendingMessage}
          placeholder={dialog.canWrite ? "Write a personal message" : "Dialog is read-only"}
          submitLabel={isSendingMessage ? "Sending..." : "Send"}
          isSending={isSendingMessage}
          errorMessage={composerError}
        />
      </section>

      <aside className="chat-sidepanel dialog-friends-rail">
        <div className="panel-card dialog-friends-rail__card">
          <div className="panel-card__header">
            <div className="stack compact-stack dialog-friends-rail__heading">
              <h3>Friends</h3>
              <small>
                {onlineFriends.length} online or afk
                {offlineFriends.length ? ` · ${offlineFriends.length} offline` : ""}
              </small>
            </div>
            <div className="inline-actions dialog-friends-rail__header-actions">
              <button type="button" className="ghost-button" onClick={handleBack}>
                Back
              </button>
              <button
                type="button"
                className="ghost-button danger-text"
                onClick={handleDeleteDialog}
                disabled={isDeletingDialog}
                aria-busy={isDeletingDialog}
              >
                {isDeletingDialog ? "Deleting..." : "Delete chat"}
              </button>
            </div>
          </div>

          <div className="dialog-friends-rail__current">
            <div className="stack compact-stack">
              <strong>Current private chat</strong>
              <small>{dialog.otherUser.displayName || dialog.otherUser.username}</small>
            </div>
          </div>

          <div className="dialog-friends-rail__sections">
            <div className="stack compact-stack">
              <p className="eyebrow">Online now</p>
              <div className="sidebar-list dialog-friends-rail__list">
                {onlineFriends.map(friend => {
                  const isActive = friend.id === dialog.otherUser.id;
                  const dialogUnread = friend.dialogId ? dialogUnreadMap.get(friend.dialogId) ?? 0 : 0;

                  return (
                    <button
                      key={friend.id}
                      type="button"
                      className={`dialog-friend-link ${isActive ? "is-active" : ""}`}
                      onClick={() => handleOpenFriendDialog(friend)}
                      disabled={isOpeningFriendDialog === friend.id}
                      aria-busy={isOpeningFriendDialog === friend.id}
                    >
                      <span className="dialog-friend-link__identity">
                        <AvatarBadge user={friend} size="sm" showLevel={false} />
                        <span className="dialog-friend-link__copy">
                          <strong>{friend.displayName || friend.username}</strong>
                          <small>@{friend.username}</small>
                        </span>
                      </span>
                      <span className="dialog-friend-link__meta">
                        <PresencePill status={friend.status} />
                        <UnreadBadge count={dialogUnread} />
                      </span>
                    </button>
                  );
                })}
                {!onlineFriends.length ? (
                  <p className="muted-label">No friends are online right now.</p>
                ) : null}
              </div>
            </div>

            <div className="stack compact-stack">
              <p className="eyebrow">Other friends</p>
              <div className="sidebar-list dialog-friends-rail__list">
                {offlineFriends.map(friend => {
                  const isActive = friend.id === dialog.otherUser.id;
                  const dialogUnread = friend.dialogId ? dialogUnreadMap.get(friend.dialogId) ?? 0 : 0;

                  return (
                    <button
                      key={friend.id}
                      type="button"
                      className={`dialog-friend-link ${isActive ? "is-active" : ""}`}
                      onClick={() => handleOpenFriendDialog(friend)}
                      disabled={isOpeningFriendDialog === friend.id}
                      aria-busy={isOpeningFriendDialog === friend.id}
                    >
                      <span className="dialog-friend-link__identity">
                        <AvatarBadge user={friend} size="sm" showLevel={false} />
                        <span className="dialog-friend-link__copy">
                          <strong>{friend.displayName || friend.username}</strong>
                          <small>@{friend.username}</small>
                        </span>
                      </span>
                      <span className="dialog-friend-link__meta">
                        <PresencePill status={friend.status} />
                        <UnreadBadge count={dialogUnread} />
                      </span>
                    </button>
                  );
                })}
                {!offlineFriends.length ? (
                  <p className="muted-label">No other friends yet.</p>
                ) : null}
              </div>
            </div>

            {!sortedFriends.length ? (
              <EmptyState
                title="No friends yet"
                description="Open the Friends page and accept or send a friend request to start a personal chat."
              />
            ) : null}
          </div>
        </div>
      </aside>

      {editingMessage ? (
        <MessageEditModal
          message={editingMessage}
          onClose={() => {
            if (!isSavingEditedMessage) {
              setEditingMessage(null);
              setEditMessageError("");
            }
          }}
          onSubmit={handleSaveEditedMessage}
          isSaving={isSavingEditedMessage}
          errorMessage={editMessageError}
        />
      ) : null}
    </div>
  );
}
