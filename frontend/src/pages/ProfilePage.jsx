import { useEffect, useMemo, useRef, useState } from "react";

import { usersApi } from "../api/usersApi.js";
import { useAuth } from "../app/store/AuthStore.jsx";
import { AvatarBadge } from "../components/ui/AvatarBadge.jsx";
import { MetricChip } from "../components/ui/MetricChip.jsx";
import { Modal } from "../components/ui/Modal.jsx";
import { HeartIcon } from "../components/ui/SocialGlyphs.jsx";
import {
  getRandomGeneratedAvatarKey,
  getSuggestedGeneratedAvatarKey,
  isGeneratedAvatarKey,
} from "../utils/avatarPresets.js";
import { getLanguageLabel, LANGUAGE_OPTIONS, normalizeLanguageCode } from "../utils/languages.js";
import {
  PROFILE_BACKGROUND_OPTIONS,
  getProfileBackgroundMeta,
  getProfileBackgroundStyle,
} from "../utils/profileBackgrounds.js";
import { formatRefreshCountdown } from "../utils/dailyRefresh.js";

const TITLE_SUGGESTIONS = [
  "Explorer",
  "Mentor",
  "Builder",
  "Captain",
  "Creator",
  "Dreamer",
];

const STATUS_SUGGESTIONS = [
  "Student",
  "Programmer",
  "Designer",
  "Creator",
  "Gamer",
  "Learner",
  "Mentor",
];

const FREE_RING_OPTIONS = [
  { key: "ring-sunrise", title: "Sunrise Ring" },
  { key: "ring-aurora", title: "Aurora Ring" },
  { key: "ring-royal", title: "Royal Ring" },
  { key: "heartflare", title: "Heartflare Ring" },
];

function pickRandomItem(items, currentKey = "") {
  const available = items.filter(item => item.key !== currentKey);
  if (!available.length) {
    return items[0]?.key ?? currentKey;
  }

  return available[Math.floor(Math.random() * available.length)].key;
}

function StatExplainModal({ kind, profile, onClose }) {
  const content = {
    level: {
      title: "Level and XP",
      body: `You are level ${profile.level}. The next level unlocks at ${profile.nextLevelXp} XP and reflects how active you are across the app.`,
    },
    hearts: {
      title: "Hearts and influence",
      body: "Hearts come from friends. They show appreciation and make helpful, active people stand out.",
    },
  }[kind];

  return (
    <Modal title={content.title} onClose={onClose}>
      <p>{content.body}</p>
    </Modal>
  );
}

function buildProfileDraft(user) {
  const avatarKey = isGeneratedAvatarKey(user.avatarKey)
    ? user.avatarKey
    : getSuggestedGeneratedAvatarKey(user);

  return {
    displayName: user.displayName ?? "",
    bio: user.bio ?? "",
    preferredLanguage: normalizeLanguageCode(user.preferredLanguage ?? "uk") || "uk",
    avatarKey,
    decorationKey: FREE_RING_OPTIONS.some(option => option.key === user.decorationKey)
      ? user.decorationKey
      : "ring-sunrise",
    profileBackgroundKey: PROFILE_BACKGROUND_OPTIONS.some(
      option => option.key === user.profileBackgroundKey,
    )
      ? user.profileBackgroundKey
      : "bg-aurora",
    profileTitle: user.profileTitle ?? user.assessmentSummary ?? "",
    statusLabel: user.statusLabel ?? user.skillFocus ?? "",
  };
}

function MetricChipButton({ kind, onOpen, children }) {
  return (
    <button type="button" className="metric-chip-button" onClick={() => onOpen(kind)}>
      {children}
    </button>
  );
}

export function ProfilePage() {
  const auth = useAuth();
  const [profile, setProfile] = useState(null);
  const [form, setForm] = useState({
    displayName: "",
    bio: "",
    preferredLanguage: "uk",
    avatarKey: "",
    decorationKey: "ring-sunrise",
    profileBackgroundKey: "bg-aurora",
    profileTitle: "",
    statusLabel: "",
  });
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [modalKind, setModalKind] = useState(null);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [questClockMs, setQuestClockMs] = useState(Date.now());
  const lastQuestRefreshRef = useRef("");

  async function loadProfile() {
    const profileResult = await usersApi.me();
    setProfile(profileResult.user);
    setForm(buildProfileDraft(profileResult.user));
  }

  useEffect(() => {
    loadProfile().catch(nextError => setError(nextError.message));
  }, []);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setQuestClockMs(Date.now());
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, []);

  function openEditor() {
    setError("");
    setStatus("");
    setIsEditingProfile(true);
  }

  function closeEditor() {
    setError("");
    setStatus("");
    setIsEditingProfile(false);
    loadProfile().catch(nextError => setError(nextError.message));
  }

  function handleRandomizeAvatar() {
    setError("");
    setStatus("Fresh letter-avatar style selected. Save profile to keep it.");
    setForm(current => ({
      ...current,
      avatarKey: getRandomGeneratedAvatarKey(
        {
          ...profile,
          displayName: current.displayName || profile.displayName,
          username: profile.username,
        },
        isGeneratedAvatarKey(current.avatarKey) ? current.avatarKey : "",
      ),
    }));
  }

  function handleRandomizeLook() {
    setError("");
    setStatus("Fresh profile look generated. Save profile to keep it.");
    setForm(current => ({
      ...current,
      avatarKey: getRandomGeneratedAvatarKey(
        {
          ...profile,
          displayName: current.displayName || profile.displayName,
          username: profile.username,
        },
        isGeneratedAvatarKey(current.avatarKey) ? current.avatarKey : "",
      ),
      decorationKey: pickRandomItem(FREE_RING_OPTIONS, current.decorationKey),
      profileBackgroundKey: pickRandomItem(
        PROFILE_BACKGROUND_OPTIONS,
        current.profileBackgroundKey,
      ),
    }));
  }

  function handleUseLetterAvatar() {
    setError("");
    setStatus("Letter avatar selected. Save profile to keep it.");
    setForm(current => ({
      ...current,
      avatarKey: getSuggestedGeneratedAvatarKey({
        ...profile,
        displayName: current.displayName || profile.displayName,
        username: profile.username,
      }),
    }));
  }

  function handleSelectDecoration(nextDecorationKey, label) {
    setError("");
    setStatus(`${label} selected. Save profile to keep it.`);
    setForm(current => ({ ...current, decorationKey: nextDecorationKey }));
  }

  function handleSelectBackground(nextBackgroundKey, label) {
    setError("");
    setStatus(`${label} selected. Save profile to keep it.`);
    setForm(current => ({ ...current, profileBackgroundKey: nextBackgroundKey }));
  }

  async function handleSaveProfile(event) {
    event.preventDefault();
    setError("");
    setStatus("");
    setIsSavingProfile(true);

    try {
      const payload = {
        avatarKey: form.avatarKey,
        decorationKey: form.decorationKey,
        profileBackgroundKey: form.profileBackgroundKey,
        displayName: form.displayName,
        bio: form.bio,
        preferredLanguage: form.preferredLanguage || "uk",
        skillFocus: form.statusLabel,
        assessmentSummary: form.profileTitle,
      };
      const result = await usersApi.updateProfile(payload);
      auth.setAuth(result.user, auth.session);
      await loadProfile();
      setStatus("Profile updated.");
      setIsEditingProfile(false);
    } catch (nextError) {
      setError(nextError.message);
    } finally {
      setIsSavingProfile(false);
    }
  }

  const questRefreshTimestamp = profile?.questRefreshAt ? new Date(profile.questRefreshAt).getTime() : null;

  useEffect(() => {
    if (!profile || !questRefreshTimestamp || Number.isNaN(questRefreshTimestamp)) {
      return;
    }

    if (questClockMs < questRefreshTimestamp) {
      return;
    }

    if (lastQuestRefreshRef.current === profile.questRefreshAt) {
      return;
    }

    lastQuestRefreshRef.current = profile.questRefreshAt;
    loadProfile().catch(nextError => setError(nextError.message));
  }, [profile, questClockMs, questRefreshTimestamp]);

  if (!profile) {
    return <div className="screen-center">Loading profile...</div>;
  }

  const liveDisplayName = (isEditingProfile ? form.displayName : profile.displayName) || profile.displayName;
  const liveBio = (isEditingProfile ? form.bio : profile.bio) || profile.bio;
  const liveLanguageCode =
    normalizeLanguageCode(isEditingProfile ? form.preferredLanguage : profile.preferredLanguage) || "uk";
  const liveProfileTitle = (
    isEditingProfile ? form.profileTitle : profile.profileTitle || profile.assessmentSummary || ""
  ).trim();
  const liveStatusLabel = (
    isEditingProfile ? form.statusLabel : profile.statusLabel || profile.skillFocus || ""
  ).trim();
  const liveAvatarKey = isEditingProfile
    ? form.avatarKey
    : isGeneratedAvatarKey(profile.avatarKey)
      ? profile.avatarKey
      : getSuggestedGeneratedAvatarKey(profile);
  const liveDecorationKey =
    (isEditingProfile ? form.decorationKey : profile.decorationKey) || "ring-sunrise";
  const liveBackgroundKey =
    (isEditingProfile ? form.profileBackgroundKey : profile.profileBackgroundKey) || "bg-aurora";

  const previewUser = {
    ...profile,
    displayName: liveDisplayName,
    avatarKey: liveAvatarKey,
    decorationKey: liveDecorationKey,
    profileBackgroundKey: liveBackgroundKey,
  };

  const mainLanguageLabel = getLanguageLabel(liveLanguageCode) || "Ukrainian";
  const activeAvatarLabel = "Random letter avatar";
  const activeRingLabel =
    FREE_RING_OPTIONS.find(option => option.key === liveDecorationKey)?.title || "Sunrise Ring";
  const activeBackgroundLabel = getProfileBackgroundMeta(liveBackgroundKey).title;
  const completedQuests = (profile.quests ?? []).filter(quest => quest.isComplete).length;
  const xpToNextLevel = Math.max((profile.nextLevelXp ?? 0) - (profile.xpPoints ?? 0), 0);
  const questRefreshLabel = questRefreshTimestamp
    ? `Refresh in ${formatRefreshCountdown(questRefreshTimestamp, questClockMs)}`
    : "";
  const achievements = [
    {
      label: "Level",
      value: `Lv ${profile.level}`,
      note: xpToNextLevel > 0 ? `${xpToNextLevel} XP to the next level` : "Top of this level reached",
    },
    {
      label: "Achievements",
      value: `${completedQuests}`,
      note: `${profile.quests?.length ?? 0} daily quests available`,
    },
    {
      label: "Influence",
      value: `${profile.heartsReceived}`,
      note: "likes received from friends",
    },
  ];

  return (
    <div className="workspace-page">
      <section
        className="hero-panel profile-stage"
        style={getProfileBackgroundStyle(liveBackgroundKey)}
      >
        <div className="profile-stage__surface">
          <div className="profile-stage__identity">
            <div className="profile-stage__avatar-column">
              <AvatarBadge user={previewUser} size="xl" />
              {isEditingProfile ? (
                <button
                  type="button"
                  className="ghost-button ghost-button--xs"
                  onClick={handleRandomizeAvatar}
                >
                  Surprise me
                </button>
              ) : null}
            </div>

            <div className="stack compact-stack profile-stage__copy">
              <p className="eyebrow">Profile</p>
              <div className="profile-name-row">
                <h1>{liveDisplayName}</h1>
                {liveProfileTitle ? <span className="pill">{liveProfileTitle}</span> : null}
              </div>
              <div className="inline-actions wrap-actions profile-stage__tags">
                <span className="stat-chip">@{profile.username}</span>
                <span className="stat-chip">{mainLanguageLabel}</span>
                {liveStatusLabel ? <span className="stat-chip">{liveStatusLabel}</span> : null}
              </div>
              <p>{liveBio || "Add a short bio to make your profile feel personal."}</p>
              <div className="profile-stage__metrics">
                <MetricChipButton kind="level" onOpen={setModalKind}>
                  <MetricChip value={`Lv ${profile.level}`} label="Level" />
                </MetricChipButton>
                <MetricChipButton kind="hearts" onOpen={setModalKind}>
                  <MetricChip
                    icon={<HeartIcon filled />}
                    value={profile.heartsReceived}
                    label="Likes received"
                    tone="heart"
                  />
                </MetricChipButton>
              </div>
            </div>
          </div>

          <div className="profile-stage__actions">
            <button
              type="button"
              className={`ghost-button ${isEditingProfile ? "is-selected" : ""}`}
              onClick={isEditingProfile ? closeEditor : openEditor}
            >
              {isEditingProfile ? "Close editor" : "Edit profile"}
            </button>
            <small>
              Look: {activeAvatarLabel} • {activeRingLabel} • {activeBackgroundLabel}
            </small>
          </div>
        </div>

        <div className="profile-achievement-strip">
          {achievements.map(item => (
            <div key={item.label} className="profile-achievement-card">
              <span className="muted-label">{item.label}</span>
              <strong>{item.value}</strong>
              <small>{item.note}</small>
            </div>
          ))}
        </div>
      </section>

      <div className="two-column-grid">
        <section className="panel-card">
          <div className="panel-card__header">
            <h2>{isEditingProfile ? "Edit profile" : "Profile overview"}</h2>
          </div>

          {isEditingProfile ? (
            <form className="stack" onSubmit={handleSaveProfile}>
              <section
                className="profile-look-editor"
                style={getProfileBackgroundStyle(liveBackgroundKey)}
              >
                <div className="profile-look-editor__hero">
                  <div className="profile-look-editor__preview">
                    <AvatarBadge user={previewUser} size="lg" />
                    <div className="stack compact-stack profile-look-editor__avatar-copy">
                      <strong>Edit your look</strong>
                      <p>
                        Your avatar style is generated from your nickname letter, while the look,
                        ring, and background can be refreshed for free.
                      </p>
                    </div>
                  </div>
                  <div className="profile-look-editor__toolbar">
                    <button
                      type="button"
                      className="ghost-button ghost-button--xs"
                      onClick={handleUseLetterAvatar}
                    >
                      Letter avatar
                    </button>
                    <button
                      type="button"
                      className="ghost-button ghost-button--xs"
                      onClick={handleRandomizeLook}
                    >
                      Randomize look
                    </button>
                  </div>
                </div>

                <div className="profile-look-editor__options">
                  <div className="stack compact-stack">
                    <small className="muted-label">Avatar</small>
                    <div className="avatar-customizer__row">
                      <button
                        type="button"
                        className="avatar-option-button is-active"
                        onClick={handleUseLetterAvatar}
                      >
                        Letter avatar
                      </button>
                      <button
                        type="button"
                        className="avatar-option-button"
                        onClick={handleRandomizeAvatar}
                      >
                        Surprise me
                      </button>
                    </div>
                  </div>

                  <div className="stack compact-stack">
                    <small className="muted-label">Ring</small>
                    <div className="avatar-customizer__row">
                      {FREE_RING_OPTIONS.map(item => (
                        <button
                          key={item.key}
                          type="button"
                          className={`avatar-option-button ${item.key === liveDecorationKey ? "is-active" : ""}`}
                          onClick={() => handleSelectDecoration(item.key, item.title)}
                        >
                          {item.title}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="stack compact-stack">
                    <small className="muted-label">Background</small>
                    <div className="avatar-customizer__row">
                      {PROFILE_BACKGROUND_OPTIONS.map(item => (
                        <button
                          key={item.key}
                          type="button"
                          className={`avatar-option-button ${item.key === liveBackgroundKey ? "is-active" : ""}`}
                          onClick={() => handleSelectBackground(item.key, item.title)}
                        >
                          {item.title}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </section>

              <input
                className="text-input"
                value={form.displayName}
                placeholder="Your name"
                onChange={event => setForm(current => ({ ...current, displayName: event.target.value }))}
              />

              <div className="profile-form-grid">
                <div className="stack compact-stack">
                  <label className="muted-label" htmlFor="profile-title-input">
                    Title
                  </label>
                  <input
                    id="profile-title-input"
                    list="profile-title-options"
                    className="text-input"
                    value={form.profileTitle}
                    placeholder="Explorer, Mentor, Builder..."
                    onChange={event =>
                      setForm(current => ({ ...current, profileTitle: event.target.value }))
                    }
                  />
                  <datalist id="profile-title-options">
                    {TITLE_SUGGESTIONS.map(option => (
                      <option key={option} value={option} />
                    ))}
                  </datalist>
                </div>

                <div className="stack compact-stack">
                  <label className="muted-label" htmlFor="profile-status-input">
                    Status
                  </label>
                  <input
                    id="profile-status-input"
                    list="profile-status-options"
                    className="text-input"
                    value={form.statusLabel}
                    placeholder="Student, Programmer, Designer..."
                    onChange={event =>
                      setForm(current => ({ ...current, statusLabel: event.target.value }))
                    }
                  />
                  <datalist id="profile-status-options">
                    {STATUS_SUGGESTIONS.map(option => (
                      <option key={option} value={option} />
                    ))}
                  </datalist>
                </div>
              </div>

              <textarea
                className="text-input"
                rows={5}
                value={form.bio}
                placeholder="A short bio about you"
                onChange={event => setForm(current => ({ ...current, bio: event.target.value }))}
              />

              <div className="stack compact-stack">
                <label className="muted-label" htmlFor="profile-language-select">
                  Main language
                </label>
                <select
                  id="profile-language-select"
                  className="text-input"
                  value={form.preferredLanguage || "uk"}
                  onChange={event =>
                    setForm(current => ({ ...current, preferredLanguage: event.target.value }))
                  }
                >
                  {[...LANGUAGE_OPTIONS]
                    .sort((left, right) => {
                      if (left.code === "uk") {
                        return -1;
                      }
                      if (right.code === "uk") {
                        return 1;
                      }
                      return left.label.localeCompare(right.label);
                    })
                    .map(option => (
                      <option key={option.code} value={option.code}>
                        {option.label}
                      </option>
                    ))}
                </select>
              </div>

              {status ? <p className="success-text">{status}</p> : null}
              {error ? <p className="error-text">{error}</p> : null}
              <div className="inline-actions wrap-actions">
                <button
                  type="submit"
                  className="primary-button"
                  disabled={isSavingProfile}
                  aria-busy={isSavingProfile}
                >
                  {isSavingProfile ? "Saving..." : "Save profile"}
                </button>
                <button type="button" className="ghost-button" onClick={closeEditor}>
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <div className="profile-overview-grid">
              <div className="info-box profile-overview-card">
                <span className="muted-label">About</span>
                <strong>{liveDisplayName}</strong>
                <p>{liveBio || "No bio yet. Open the editor when you want to add one."}</p>
              </div>

              <div className="info-box profile-overview-card">
                <span className="muted-label">Identity</span>
                <strong>{liveProfileTitle || "No title yet"}</strong>
                <p>{liveStatusLabel || "No status set yet"}</p>
              </div>

              <div className="info-box profile-overview-card">
                <span className="muted-label">Main language</span>
                <strong>{mainLanguageLabel}</strong>
                <p>Used for translation hints in chats.</p>
              </div>

              <div className="info-box profile-overview-card">
                <span className="muted-label">Current look</span>
                <strong>{activeAvatarLabel}</strong>
                <p>
                  {activeRingLabel} with {activeBackgroundLabel}.
                </p>
              </div>
            </div>
          )}
        </section>

        <section className="panel-card">
          <div className="panel-card__header">
            <h2>Achievements and daily quests</h2>
            <span className="stat-chip refresh-chip">
              {questRefreshLabel || "Daily reset at 4:00 PM"}
            </span>
          </div>
          <div className="stack">
            <div className="progress-bar">
              <div
                className="progress-bar__fill"
                style={{ width: `${profile.progressPercent ?? 0}%` }}
              />
            </div>
            <small>
              {profile.xpPoints} XP total | next unlock at {profile.nextLevelXp} XP
            </small>

            {(profile.quests ?? []).map(quest => (
              <div key={quest.id} className="catalog-card profile-card">
                <div>
                  <strong>{quest.title}</strong>
                  <p>{quest.description}</p>
                  <small>
                    {quest.progress}/{quest.target} | reward {quest.rewardXp} XP
                  </small>
                </div>
                <span className={`quest-pill ${quest.isComplete ? "is-complete" : ""}`}>
                  {quest.isComplete ? "Ready" : "In progress"}
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>

      {modalKind ? (
        <StatExplainModal kind={modalKind} profile={profile} onClose={() => setModalKind(null)} />
      ) : null}
    </div>
  );
}
