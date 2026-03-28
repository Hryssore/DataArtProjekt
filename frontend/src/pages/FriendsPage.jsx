import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";

import { dialogsApi } from "../api/dialogsApi.js";
import { friendsApi } from "../api/friendsApi.js";
import { usersApi } from "../api/usersApi.js";
import { AvatarBadge } from "../components/ui/AvatarBadge.jsx";
import { EmptyState } from "../components/ui/EmptyState.jsx";
import { HeartActionButton } from "../components/ui/HeartActionButton.jsx";
import { PresencePill } from "../components/ui/PresencePill.jsx";

function normalizeUserLookupQuery(value) {
  return value.trim().replace(/^@+/, "");
}

export function FriendsPage() {
  const navigate = useNavigate();
  const { refreshWorkspace } = useOutletContext();
  const [friends, setFriends] = useState([]);
  const [requests, setRequests] = useState([]);
  const [username, setUsername] = useState("");
  const [userSearchResults, setUserSearchResults] = useState([]);
  const [userSearchCompletedQuery, setUserSearchCompletedQuery] = useState("");
  const [error, setError] = useState("");
  const [busyActionKey, setBusyActionKey] = useState("");
  const [isSearchingUsers, setIsSearchingUsers] = useState(false);
  const userSearchRequestRef = useRef(0);

  async function loadData() {
    const [friendsResult, requestsResult] = await Promise.all([
      friendsApi.list(),
      friendsApi.listRequests(),
    ]);
    setFriends(friendsResult.friends);
    setRequests(requestsResult.requests);
  }

  useEffect(() => {
    loadData().catch(() => undefined);
  }, []);

  const sortedFriends = useMemo(() => {
    const statusOrder = { online: 0, afk: 1, offline: 2 };
    return [...friends].sort((left, right) => {
      const leftRank = statusOrder[left.status] ?? 3;
      const rightRank = statusOrder[right.status] ?? 3;
      if (leftRank !== rightRank) {
        return leftRank - rightRank;
      }
      return left.displayName.localeCompare(right.displayName);
    });
  }, [friends]);
  const onlineOrAfkCount = sortedFriends.filter(friend => friend.status !== "offline").length;
  const offlineCount = sortedFriends.filter(friend => friend.status === "offline").length;
  const normalizedUsernameQuery = useMemo(
    () => normalizeUserLookupQuery(username),
    [username],
  );
  const friendIds = useMemo(() => friends.map(friend => friend.id), [friends]);
  const outgoingRequestUserIds = useMemo(
    () =>
      requests
        .filter(request => request.direction === "outgoing" && request.status === "pending")
        .map(request => request.receiver.id),
    [requests],
  );
  const shouldShowUserMatches =
    normalizedUsernameQuery.length > 0 &&
    userSearchCompletedQuery === normalizedUsernameQuery &&
    userSearchResults.length > 0;
  const shouldShowUserNotFound =
    normalizedUsernameQuery.length > 0 &&
    !isSearchingUsers &&
    userSearchCompletedQuery === normalizedUsernameQuery &&
    userSearchResults.length === 0;
  const pendingRequests = useMemo(
    () => requests.filter(request => request.status === "pending"),
    [requests],
  );

  const upsertRequest = useCallback(nextRequest => {
    setRequests(current => [nextRequest, ...current.filter(item => item.id !== nextRequest.id)]);
  }, []);

  const runUserSearch = useCallback(async rawQuery => {
    const normalizedQuery = normalizeUserLookupQuery(rawQuery);

    if (!normalizedQuery) {
      userSearchRequestRef.current += 1;
      setUserSearchResults([]);
      setUserSearchCompletedQuery("");
      setIsSearchingUsers(false);
      return;
    }

    const requestId = userSearchRequestRef.current + 1;
    userSearchRequestRef.current = requestId;
    setIsSearchingUsers(true);

    try {
      const result = await usersApi.search(normalizedQuery);
      if (userSearchRequestRef.current !== requestId) {
        return;
      }

      setUserSearchResults(result.users);
      setUserSearchCompletedQuery(normalizedQuery);
    } catch (nextError) {
      if (userSearchRequestRef.current !== requestId) {
        return;
      }

      setUserSearchResults([]);
      setUserSearchCompletedQuery(normalizedQuery);
      throw nextError;
    } finally {
      if (userSearchRequestRef.current === requestId) {
        setIsSearchingUsers(false);
      }
    }
  }, []);

  async function handleSendRequest(event) {
    event.preventDefault();
    setError("");
    setBusyActionKey("send-request");

    try {
      const result = await friendsApi.createRequest({ username: normalizedUsernameQuery });
      setUsername("");
      setUserSearchResults([]);
      setUserSearchCompletedQuery("");
      upsertRequest(result.request);
    } catch (nextError) {
      setError(nextError.message);
    } finally {
      setBusyActionKey("");
    }
  }

  async function handleSendRequestToUser(user) {
    setError("");
    setBusyActionKey(`send-request:${user.id}`);

    try {
      const result = await friendsApi.createRequest({ targetUserId: user.id });
      setUsername(`@${user.username}`);
      upsertRequest(result.request);
    } catch (nextError) {
      setError(nextError.message);
    } finally {
      setBusyActionKey("");
    }
  }

  async function handleAcceptRequest(requestId) {
    setBusyActionKey(`accept:${requestId}`);
    try {
      await friendsApi.acceptRequest(requestId);
      await Promise.all([loadData(), refreshWorkspace()]);
    } finally {
      setBusyActionKey("");
    }
  }

  async function handleRejectRequest(requestId) {
    setBusyActionKey(`reject:${requestId}`);
    try {
      await friendsApi.rejectRequest(requestId);
      await Promise.all([loadData(), refreshWorkspace()]);
    } finally {
      setBusyActionKey("");
    }
  }

  async function handleCancelRequest(requestId) {
    setBusyActionKey(`cancel:${requestId}`);
    try {
      await friendsApi.cancelRequest(requestId);
      await Promise.all([loadData(), refreshWorkspace()]);
    } finally {
      setBusyActionKey("");
    }
  }

  async function handleOpenDialog(friend) {
    setBusyActionKey(`dialog:${friend.id}`);
    try {
      const result = await dialogsApi.getOrCreateWithUser(friend.id);
      await refreshWorkspace();
      navigate(`/dialogs/${result.dialog.id}`);
    } finally {
      setBusyActionKey("");
    }
  }

  async function handleDeleteDialog(friend) {
    if (!friend.dialogId) {
      return;
    }

    setBusyActionKey(`delete-dialog:${friend.id}`);
    try {
      await dialogsApi.remove(friend.dialogId);
      await Promise.all([loadData(), refreshWorkspace()]);
    } finally {
      setBusyActionKey("");
    }
  }

  async function handleRemoveFriend(friendId) {
    setBusyActionKey(`remove:${friendId}`);
    try {
      await friendsApi.remove(friendId);
      await Promise.all([loadData(), refreshWorkspace()]);
    } finally {
      setBusyActionKey("");
    }
  }

  async function handleBan(friendId) {
    setBusyActionKey(`ban:${friendId}`);
    try {
      await friendsApi.ban(friendId);
      await Promise.all([loadData(), refreshWorkspace()]);
    } finally {
      setBusyActionKey("");
    }
  }

  async function handleSendHeart(friendId) {
    setBusyActionKey(`heart:${friendId}`);
    setError("");
    try {
      const result = await usersApi.sendHeart(friendId);
      setFriends(current =>
        current.map(friend =>
          friend.id === friendId
            ? {
                ...friend,
                heartsReceived: result.user?.heartsReceived ?? friend.heartsReceived,
                isLikedByCurrentUser:
                  result.user?.isLikedByCurrentUser ?? !friend.isLikedByCurrentUser,
              }
            : friend,
        ),
      );
      await refreshWorkspace();
    } catch (nextError) {
      setError(nextError.message);
    } finally {
      setBusyActionKey("");
    }
  }

  useEffect(() => {
    if (!normalizedUsernameQuery) {
      userSearchRequestRef.current += 1;
      setUserSearchResults([]);
      setUserSearchCompletedQuery("");
      setIsSearchingUsers(false);
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      runUserSearch(username).catch(() => {});
    }, 240);

    return () => window.clearTimeout(timeoutId);
  }, [normalizedUsernameQuery, runUserSearch, username]);

  return (
    <div className="workspace-page">
      <section className="hero-panel">
        <div>
          <p className="eyebrow">Social graph</p>
          <h1>Friends and requests</h1>
          <p>See who is online, open dialogs, send hearts, and manage personal access rules.</p>
        </div>
        <form className="inline-form" onSubmit={handleSendRequest}>
          <input
            className="text-input"
            placeholder="Send friend request by @username"
            value={username}
            onChange={event => setUsername(event.target.value)}
          />
          <button
            type="submit"
            className="primary-button"
            disabled={busyActionKey === "send-request" || !normalizedUsernameQuery}
            aria-busy={busyActionKey === "send-request"}
          >
            {busyActionKey === "send-request" ? "Sending..." : "Send request"}
          </button>
        </form>
      </section>

      {error ? <p className="error-text">{error}</p> : null}

      {normalizedUsernameQuery ? (
        <section className="panel-card">
          <div className="panel-card__header">
            <h2>Matching tags</h2>
            <small>
              {isSearchingUsers
                ? "Searching..."
                : shouldShowUserMatches
                  ? `Results for @${normalizedUsernameQuery}`
                  : shouldShowUserNotFound
                    ? "No users found"
                    : "Type a tag to search"}
            </small>
          </div>

          <div className="invite-search-results">
            {shouldShowUserMatches
              ? userSearchResults.map(result => {
                  const isFriend = friendIds.includes(result.id);
                  const isPending = outgoingRequestUserIds.includes(result.id);
                  const isSending = busyActionKey === `send-request:${result.id}`;

                  return (
                    <div key={result.id} className="member-row member-row--drawer">
                      <AvatarBadge user={result} />
                      <div className="member-row__content">
                        <div className="member-row__top">
                          <strong>{result.displayName || result.username}</strong>
                          <span className="pill">Lv {result.level}</span>
                        </div>
                        <small>@{result.username}</small>
                      </div>
                      <div className="member-row__actions">
                        <button
                          type="button"
                          className="ghost-button"
                          onClick={() => handleSendRequestToUser(result)}
                          disabled={isFriend || isPending || isSending}
                          aria-busy={isSending}
                        >
                          {isFriend
                            ? "Friend"
                            : isPending
                              ? "Request sent"
                              : isSending
                                ? "Sending..."
                                : "Add friend"}
                        </button>
                      </div>
                    </div>
                  );
                })
              : null}

            {shouldShowUserNotFound ? (
              <p className="invite-search-feedback">No users found for this tag.</p>
            ) : null}
          </div>
        </section>
      ) : null}

      <div className="two-column-grid">
        <section className="panel-card">
          <div className="panel-card__header">
            <h2>Friends</h2>
            <small>
              {onlineOrAfkCount} online or afk
              {offlineCount ? ` · ${offlineCount} offline` : ""}
            </small>
          </div>
          <div className="stack">
            {sortedFriends.map(friend => (
              <div key={friend.id} className="catalog-card friend-card">
                <div className="friend-card__top">
                  <div className="friend-card__identity">
                    <div className="friend-card__avatar-stack">
                      <AvatarBadge user={friend} />
                    </div>
                    <div className="friend-card__copy">
                      <div className="friend-card__headline">
                        <strong>{friend.displayName}</strong>
                        <p>@{friend.username}</p>
                      </div>
                      <PresencePill status={friend.status} />
                    </div>
                  </div>
                  <div className="friend-card__heart">
                    <HeartActionButton
                      liked={friend.isLikedByCurrentUser}
                      count={friend.heartsReceived}
                      isBusy={busyActionKey === `heart:${friend.id}`}
                      onClick={() => handleSendHeart(friend.id)}
                      disabled={busyActionKey === `heart:${friend.id}`}
                    />
                  </div>
                </div>
                <div className="friend-card__actions">
                  <div className="inline-actions wrap-actions friend-card__actions-main">
                    <button
                      type="button"
                      className="ghost-button"
                      onClick={() => navigate(`/users/${friend.id}`)}
                    >
                      View profile
                    </button>
                    <button
                      type="button"
                      className="ghost-button"
                      onClick={() => handleOpenDialog(friend)}
                      disabled={busyActionKey === `dialog:${friend.id}`}
                      aria-busy={busyActionKey === `dialog:${friend.id}`}
                    >
                      {busyActionKey === `dialog:${friend.id}` ? "Opening..." : "Open dialog"}
                    </button>
                  </div>
                  <div className="inline-actions wrap-actions friend-card__actions-secondary">
                    <button
                      type="button"
                      className="ghost-button danger-text"
                      onClick={() => handleDeleteDialog(friend)}
                      disabled={!friend.dialogId || busyActionKey === `delete-dialog:${friend.id}`}
                      aria-busy={busyActionKey === `delete-dialog:${friend.id}`}
                    >
                      {busyActionKey === `delete-dialog:${friend.id}` ? "Deleting..." : "Delete chat"}
                    </button>
                    <button
                      type="button"
                      className="ghost-button"
                      onClick={() => handleRemoveFriend(friend.id)}
                      disabled={busyActionKey === `remove:${friend.id}`}
                      aria-busy={busyActionKey === `remove:${friend.id}`}
                    >
                      {busyActionKey === `remove:${friend.id}` ? "Removing..." : "Remove"}
                    </button>
                    <button
                      type="button"
                      className="ghost-button danger-text"
                      onClick={() => handleBan(friend.id)}
                      disabled={busyActionKey === `ban:${friend.id}`}
                      aria-busy={busyActionKey === `ban:${friend.id}`}
                    >
                      {busyActionKey === `ban:${friend.id}` ? "Banning..." : "Ban"}
                    </button>
                  </div>
                </div>
              </div>
            ))}
            {!sortedFriends.length ? (
              <EmptyState title="No friends yet" description="Send requests by immutable username." />
            ) : null}
          </div>
        </section>

        <section className="panel-card">
          <div className="panel-card__header">
            <h2>Requests</h2>
          </div>
          <div className="stack">
            {pendingRequests.map(request => (
              <div key={request.id} className="catalog-card">
                <div>
                  <strong>
                    {request.direction === "incoming"
                      ? `${request.sender.displayName} -> you`
                      : `you -> ${request.receiver.displayName}`}
                  </strong>
                  <p>{request.message || "No request message"}</p>
                  <small>@{request.direction === "incoming" ? request.sender.username : request.receiver.username}</small>
                </div>
                {request.direction === "incoming" && request.status === "pending" ? (
                  <div className="inline-actions">
                    <button
                      type="button"
                      className="primary-button"
                      disabled={busyActionKey === `accept:${request.id}`}
                      aria-busy={busyActionKey === `accept:${request.id}`}
                      onClick={() => handleAcceptRequest(request.id)}
                    >
                      {busyActionKey === `accept:${request.id}` ? "Accepting..." : "Accept"}
                    </button>
                    <button
                      type="button"
                      className="ghost-button"
                      disabled={busyActionKey === `reject:${request.id}`}
                      aria-busy={busyActionKey === `reject:${request.id}`}
                      onClick={() => handleRejectRequest(request.id)}
                    >
                      {busyActionKey === `reject:${request.id}` ? "Rejecting..." : "Reject"}
                    </button>
                  </div>
                ) : null}
                {request.direction === "outgoing" && request.status === "pending" ? (
                  <div className="inline-actions">
                    <button
                      type="button"
                      className="ghost-button danger-text"
                      disabled={busyActionKey === `cancel:${request.id}`}
                      aria-busy={busyActionKey === `cancel:${request.id}`}
                      onClick={() => handleCancelRequest(request.id)}
                    >
                      {busyActionKey === `cancel:${request.id}` ? "Cancelling..." : "Cancel request"}
                    </button>
                  </div>
                ) : null}
              </div>
            ))}
            {!pendingRequests.length ? (
              <EmptyState title="No pending requests" description="Incoming and outgoing friend requests will appear here." />
            ) : null}
          </div>
        </section>
      </div>
    </div>
  );
}
