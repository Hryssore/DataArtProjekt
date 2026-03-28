import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { usersApi } from "../api/usersApi.js";
import { AvatarBadge } from "../components/ui/AvatarBadge.jsx";
import { HeartActionButton } from "../components/ui/HeartActionButton.jsx";
import { MetricChip } from "../components/ui/MetricChip.jsx";
import { HeartIcon } from "../components/ui/SocialGlyphs.jsx";
import { getLanguageLabel } from "../utils/languages.js";

export function UserProfilePage() {
  const { userId } = useParams();
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState("");
  const [isSendingHeart, setIsSendingHeart] = useState(false);

  useEffect(() => {
    usersApi
      .getById(userId)
      .then(result => {
        setProfile(result.user);
        setError("");
      })
      .catch(nextError => {
        setError(nextError.message || "Profile could not be loaded.");
      });
  }, [userId]);

  if (error) {
    return (
      <div className="workspace-page">
        <section className="panel-card stack">
          <h1>User profile</h1>
          <p className="error-text">{error}</p>
          <div className="inline-actions">
            <Link to="/friends" className="ghost-button">
              Back to friends
            </Link>
          </div>
        </section>
      </div>
    );
  }

  if (!profile) {
    return <div className="screen-center">Loading profile...</div>;
  }

  const languageLabel = getLanguageLabel(profile.preferredLanguage) || "Ukrainian";

  async function handleSendHeart() {
    setIsSendingHeart(true);
    setError("");
    try {
      const result = await usersApi.sendHeart(profile.id);
      setProfile(current => ({
        ...current,
        heartsReceived: result.user?.heartsReceived ?? (current.heartsReceived ?? 0),
        relationship: {
          ...current.relationship,
          isLikedByCurrentUser:
            result.user?.isLikedByCurrentUser ?? !current.relationship?.isLikedByCurrentUser,
        },
      }));
    } catch (nextError) {
      setError(nextError.message || "Heart could not be sent.");
    } finally {
      setIsSendingHeart(false);
    }
  }

  return (
    <div className="workspace-page">
      <section className="hero-panel public-profile-hero">
        <div className="public-profile-hero__identity">
          <AvatarBadge user={profile} size="lg" />
          <div className="public-profile-hero__copy">
            <p className="eyebrow">Public profile</p>
            <div className="profile-name-row public-profile-hero__name-row">
              <h1>{profile.displayName}</h1>
              {profile.profileTitle ? <span className="pill">{profile.profileTitle}</span> : null}
            </div>
            <div className="inline-actions wrap-actions public-profile-hero__tags">
              <span className="stat-chip">@{profile.username}</span>
              <span className="stat-chip">{languageLabel}</span>
              {profile.statusLabel ? <span className="stat-chip">{profile.statusLabel}</span> : null}
              {profile.relationship?.isFriend ? <span className="pill">friend</span> : null}
            </div>
            <p className="public-profile-hero__bio">
              {profile.bio || "This user has not added a bio yet."}
            </p>
          </div>
        </div>
        <div className="inline-actions wrap-actions public-profile-hero__metrics">
          <MetricChip value={`Lv ${profile.level}`} label="Level" />
          {!profile.relationship?.isSelf ? (
            <HeartActionButton
              liked={profile.relationship?.isLikedByCurrentUser}
              count={profile.heartsReceived ?? 0}
              isBusy={isSendingHeart}
              onClick={handleSendHeart}
              disabled={isSendingHeart || !profile.relationship?.isFriend}
              label={profile.relationship?.isFriend ? undefined : "Friends only"}
              compact
            />
          ) : (
            <MetricChip
              icon={<HeartIcon filled />}
              value={profile.heartsReceived ?? 0}
              label="Hearts"
              tone="heart"
            />
          )}
        </div>
      </section>

      <div className="profile-stat-grid public-profile-stat-grid">
        <article className="panel-card stack compact-stack">
          <p className="eyebrow">Messages</p>
          <strong>{profile.stats?.sentMessages ?? 0}</strong>
          <small>Non-deleted messages sent across rooms and dialogs.</small>
        </article>
        <article className="panel-card stack compact-stack">
          <p className="eyebrow">Rooms</p>
          <strong>{profile.stats?.joinedRooms ?? 0}</strong>
          <small>Joined rooms currently linked to this profile.</small>
        </article>
        <article className="panel-card stack compact-stack">
          <p className="eyebrow">Friends</p>
          <strong>{profile.stats?.friendsCount ?? 0}</strong>
          <small>Accepted friends visible in the contact list.</small>
        </article>
        <article className="panel-card stack compact-stack">
          <p className="eyebrow">Daily XP</p>
          <strong>{profile.stats?.dailyXp ?? 0}</strong>
          <small>XP earned over the last day.</small>
        </article>
      </div>
    </div>
  );
}
