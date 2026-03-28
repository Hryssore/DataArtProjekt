import { AvatarBadge } from "../ui/AvatarBadge.jsx";
import { PresencePill } from "../ui/PresencePill.jsx";

export function MemberList({
  members,
  canModerate,
  onManageMember,
  onOpenBans,
  currentUserId = null,
  onRequestFriend = null,
  onViewProfile = null,
  pendingFriendRequestUserId = null,
  outgoingFriendRequestUserIds = [],
  friendUserIds = [],
  isOpeningBans = false,
}) {
  return (
    <div className="member-list-card">
      <div className="panel-card__header">
        <h3>Members</h3>
        {canModerate ? (
          <button
            type="button"
            className="ghost-button"
            onClick={onOpenBans}
            disabled={isOpeningBans}
            aria-busy={isOpeningBans}
          >
            {isOpeningBans ? "Opening..." : "Bans"}
          </button>
        ) : null}
      </div>
      <div className="member-list">
        {members.map(member => (
          <div key={member.id} className="member-row member-row--drawer member-row--member-card">
            <div className="member-row__main">
              <div className="member-row__identity">
                <AvatarBadge user={member} />
                <div className="member-row__content">
                  <div className="profile-name-row profile-name-row--compact member-row__name">
                    <strong>{member.displayName || member.username}</strong>
                    {member.isOwner ? <span className="pill">owner</span> : null}
                    {member.isAdmin && !member.isOwner ? <span className="pill">admin</span> : null}
                    {member.id === currentUserId ? <span className="pill">you</span> : null}
                  </div>
                  <small>@{member.username}</small>
                  <PresencePill status={member.status} />
                </div>
              </div>
              <span className="pill member-row__level">Lv {member.level}</span>
            </div>
            <div className="member-row__actions">
              <div className="inline-actions wrap-actions">
                {member.id !== currentUserId && onRequestFriend ? (() => {
                  const isFriend = friendUserIds.includes(member.id);
                  const hasOutgoingRequest = outgoingFriendRequestUserIds.includes(member.id);
                  const isSending = pendingFriendRequestUserId === member.id;

                  return (
                    <button
                      type="button"
                      className="ghost-button"
                      onClick={() => onRequestFriend(member)}
                      disabled={isFriend || hasOutgoingRequest || isSending}
                      aria-busy={isSending}
                    >
                      {isFriend
                        ? "Friend"
                        : isSending
                          ? "Sending..."
                          : hasOutgoingRequest
                            ? "Request sent"
                            : "Add friend"}
                    </button>
                  );
                })() : null}
                {member.id !== currentUserId && onViewProfile ? (
                  <button
                    type="button"
                    className="ghost-button"
                    onClick={() => onViewProfile(member)}
                  >
                    Profile
                  </button>
                ) : null}
                {canModerate ? (
                  <button
                    type="button"
                    className="ghost-button"
                    onClick={() => onManageMember(member)}
                  >
                    Manage
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
