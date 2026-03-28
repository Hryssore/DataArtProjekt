import { Link, NavLink, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";

import { dialogsApi } from "../../api/dialogsApi.js";
import { usersApi } from "../../api/usersApi.js";
import { AvatarBadge } from "../ui/AvatarBadge.jsx";
import { MetricChip } from "../ui/MetricChip.jsx";
import { PresencePill } from "../ui/PresencePill.jsx";
import { HeartIcon, TrophyIcon } from "../ui/SocialGlyphs.jsx";
import { UnreadBadge } from "../ui/UnreadBadge.jsx";

export function RightSidebar({
  rooms,
  dialogs,
  friends,
  unread,
  onLogout,
  onWorkspaceRefresh,
  currentUser,
}) {
  const location = useLocation();
  const [leaderboardSnapshot, setLeaderboardSnapshot] = useState(null);
  const [deletingDialogId, setDeletingDialogId] = useState("");
  const isRoomContext = location.pathname.startsWith("/rooms/") && location.pathname.includes("/chat");
  const getRoomPath = room =>
    `/rooms/${room.id}/chat${room.category === "voice" ? "?pane=voice" : ""}`;

  const roomUnreadMap = new Map((unread?.rooms ?? []).map(item => [item.roomId, item.unreadCount]));
  const dialogUnreadMap = new Map(
    (unread?.dialogs ?? []).map(item => [item.dialogId, item.unreadCount]),
  );
  const onlineFriendsCount = (friends ?? []).filter(friend => friend.status !== "offline").length;
  const offlineFriendsCount = (friends ?? []).filter(friend => friend.status === "offline").length;

  useEffect(() => {
    usersApi
      .leaderboard("week")
      .then(result => setLeaderboardSnapshot(result.viewer ?? null))
      .catch(() => undefined);
  }, []);

  const quickLinks = [
    {
      to: "/profile",
      label: "Profile",
      description: "Name, bio, avatar",
    },
    {
      to: "/friends",
      label: "Friends",
      description: "Requests and chats",
    },
    {
      to: "/settings",
      label: "Settings",
      description: "Theme, history, sessions",
    },
  ];

  function renderRoomsList() {
    return (
      <div className="sidebar-list">
        {rooms.map(room => (
          <NavLink
            key={room.id}
            className={`sidebar-link sidebar-link--rich ${location.pathname.includes(`/rooms/${room.id}/chat`) ? "is-active" : ""}`}
            to={getRoomPath(room)}
          >
            <span className="sidebar-link__stack">
              <strong>{room.name}</strong>
              <small>
                {room.visibility} {room.category}
              </small>
            </span>
            <UnreadBadge count={roomUnreadMap.get(room.id) ?? 0} />
          </NavLink>
        ))}
        {!rooms.length ? (
          <p className="muted-label">No rooms yet. Create one or join a public room.</p>
        ) : null}
      </div>
    );
  }

  function renderDialogsList() {
    return (
      <div className="sidebar-list">
        {dialogs.map(dialog => (
          <div key={dialog.id} className="sidebar-dialog-row">
            <NavLink
              className={`sidebar-link sidebar-link--rich sidebar-dialog-row__link ${location.pathname.includes(`/dialogs/${dialog.id}`) ? "is-active" : ""}`}
              to={`/dialogs/${dialog.id}`}
            >
              <span className="sidebar-entry__identity">
                <AvatarBadge user={dialog.otherUser} size="sm" showLevel={false} />
                <span className="sidebar-link__stack">
                  <strong>{dialog.otherUser.displayName || dialog.otherUser.username}</strong>
                  <small>@{dialog.otherUser.username}</small>
                </span>
              </span>
              <UnreadBadge count={dialogUnreadMap.get(dialog.id) ?? 0} />
            </NavLink>
            <div className="sidebar-dialog-row__footer">
              <PresencePill status={dialog.otherUser.status} />
              <button
                type="button"
                className="ghost-button danger-text sidebar-dialog-row__delete"
                onClick={async event => {
                  event.preventDefault();
                  event.stopPropagation();
                  setDeletingDialogId(dialog.id);
                  try {
                    await dialogsApi.remove(dialog.id);
                    await onWorkspaceRefresh?.();
                  } finally {
                    setDeletingDialogId("");
                  }
                }}
                disabled={deletingDialogId === dialog.id}
                aria-busy={deletingDialogId === dialog.id}
              >
                {deletingDialogId === dialog.id ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        ))}
        {!dialogs.length ? (
          <p className="muted-label">Your chats with friends will appear here.</p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="right-sidebar">
      <Link to="/leaderboard" className="sidebar-top-card">
        <div className="sidebar-top-card__icon">
          <TrophyIcon />
        </div>
        <div className="sidebar-top-card__copy">
          <p className="eyebrow">Top</p>
          <strong>
            {leaderboardSnapshot?.isTopTen
              ? `#${leaderboardSnapshot.rank}`
              : leaderboardSnapshot?.topPercent
                ? `Top ${leaderboardSnapshot.topPercent}%`
                : "Leaderboard"}
          </strong>
          <small>
            {leaderboardSnapshot?.isTopTen
              ? `Top 10 this week`
              : leaderboardSnapshot?.rank
                ? `Rank #${leaderboardSnapshot.rank}`
                : "See your place"}
          </small>
        </div>
        <div className="sidebar-top-card__stats">
          <span className="stat-chip">{leaderboardSnapshot?.xpGained ?? 0} XP</span>
          {leaderboardSnapshot?.topPercent ? (
            <span className="stat-chip">Top {leaderboardSnapshot.topPercent}%</span>
          ) : null}
        </div>
      </Link>

      <div className="sidebar-card sidebar-card--profile sidebar-profile-card">
        <div className="sidebar-profile sidebar-profile-card__top">
          <AvatarBadge user={currentUser} size="lg" />
          <div className="stack compact-stack sidebar-profile-card__copy">
            <p className="eyebrow">Your space</p>
            <div className="stack compact-stack sidebar-profile-card__identity">
              <div className="profile-name-row profile-name-row--compact">
                <strong>{currentUser?.displayName || currentUser?.username}</strong>
                {currentUser?.profileTitle ? <span className="pill">{currentUser.profileTitle}</span> : null}
              </div>
              <span className="stat-chip">@{currentUser?.username}</span>
            </div>
            {currentUser?.statusLabel ? (
              <div className="inline-actions wrap-actions sidebar-profile-card__tags">
                <span className="stat-chip">{currentUser.statusLabel}</span>
              </div>
            ) : null}
          </div>
        </div>
        <p className="sidebar-section-note sidebar-profile-card__bio">
          {currentUser?.bio || "Set up your profile, jump into rooms, or open private chats."}
        </p>
        <div className="inline-actions wrap-actions sidebar-profile-card__metrics">
          <MetricChip
            icon={<HeartIcon filled />}
            value={currentUser?.heartsReceived ?? 0}
            label="Likes received"
            tone="heart"
          />
        </div>
        <div className="sidebar-pill-nav">
          {quickLinks.map(link => (
            <NavLink
              key={link.to}
              to={link.to}
              className={`sidebar-pill-link ${location.pathname.startsWith(link.to) ? "is-active" : ""}`}
            >
              <div className="sidebar-pill-link__copy">
                <span>{link.label}</span>
                <small>{link.description}</small>
              </div>
              <span className="sidebar-pill-link__arrow">{">"}</span>
            </NavLink>
          ))}
        </div>
        <button type="button" className="ghost-button sidebar-logout-button" onClick={onLogout}>
          Logout
        </button>
      </div>

      {isRoomContext ? (
        <>
          <details className="sidebar-accordion" open>
            <summary className="sidebar-accordion__summary">
              <span>
                <strong>Your rooms</strong>
                <small>{rooms.length} joined spaces</small>
              </span>
              <Link to="/rooms" className="text-link">
                Browse
              </Link>
            </summary>
            <div className="sidebar-accordion__content">{renderRoomsList()}</div>
          </details>

          <details className="sidebar-accordion">
            <summary className="sidebar-accordion__summary">
              <span>
                <strong>Private chats</strong>
                <small>
                  {onlineFriendsCount} online or afk
                  {offlineFriendsCount ? ` · ${offlineFriendsCount} offline` : ""}
                </small>
              </span>
              <Link to="/friends" className="text-link">
                Manage
              </Link>
            </summary>
            <div className="sidebar-accordion__content">{renderDialogsList()}</div>
          </details>
        </>
      ) : (
        <>
          <div className="sidebar-card">
            <div className="sidebar-card__header">
              <div className="stack compact-stack">
                <h3>Your rooms</h3>
                <small>{rooms.length} joined spaces</small>
              </div>
              <Link to="/rooms" className="text-link">
                Browse
              </Link>
            </div>
            {renderRoomsList()}
          </div>

          <div className="sidebar-card">
            <div className="sidebar-card__header">
              <div className="stack compact-stack">
                <h3>Private chats</h3>
                <small>
                  {onlineFriendsCount} online or afk
                  {offlineFriendsCount ? ` · ${offlineFriendsCount} offline` : ""}
                </small>
              </div>
              <Link to="/friends" className="text-link">
                Manage
              </Link>
            </div>
            {renderDialogsList()}
          </div>
        </>
      )}
    </div>
  );
}
