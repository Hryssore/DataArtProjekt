import { useEffect, useMemo, useState } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";

import { roomsApi } from "../api/roomsApi.js";
import { EmptyState } from "../components/ui/EmptyState.jsx";

const initialCreateForm = {
  name: "",
  description: "",
  visibility: "public",
  category: "general",
  maxMembers: "",
  levelRequirement: 1,
  voiceEnabled: false,
  videoEnabled: false,
  isListed: true,
};

function getRoomPath(room) {
  return `/rooms/${room.id}/chat${room.category === "voice" ? "?pane=voice" : ""}`;
}

export function RoomsCatalogPage() {
  const navigate = useNavigate();
  const { refreshWorkspace, currentUser } = useOutletContext();
  const [rooms, setRooms] = useState([]);
  const [invitations, setInvitations] = useState([]);
  const [filters, setFilters] = useState({
    search: "",
    category: "all",
    sort: "popular",
    onlyAvailable: false,
    voiceEnabled: false,
    videoEnabled: false,
  });
  const [form, setForm] = useState(initialCreateForm);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [joiningRoomId, setJoiningRoomId] = useState(null);
  const [acceptingInvitationId, setAcceptingInvitationId] = useState(null);
  const [error, setError] = useState("");

  async function loadCatalog() {
    const [catalogResult, invitationsResult] = await Promise.all([
      roomsApi.listCatalog(filters),
      roomsApi.listInvitations(),
    ]);
    setRooms(catalogResult.rooms);
    setInvitations(invitationsResult.invitations);
  }

  useEffect(() => {
    loadCatalog().catch(() => undefined);
  }, [filters]);

  const searchQuery = filters.search.trim();
  const isSearching = searchQuery.length > 0;

  const publicRoomSummary = useMemo(() => {
    const onlineRooms = rooms.filter(room => room.onlineCount > 0).length;
    return `${rooms.length} public rooms, ${onlineRooms} active right now`;
  }, [rooms]);

  const heroDescription = isSearching
    ? "Showing only rooms that match your search. Clear the search field to create a new room or review invitations again."
    : "Browse listed public rooms, search by name, sort by popularity, and open private invites.";

  const heroMeta = isSearching
    ? `${rooms.length} ${rooms.length === 1 ? "match" : "matches"} for "${searchQuery}"`
    : publicRoomSummary;

  async function handleCreateRoom(event) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    const trimmedName = form.name.trim();
    if (trimmedName.length < 3) {
      setError("Room name must be at least 3 characters long.");
      setIsSubmitting(false);
      return;
    }

    try {
      const payload = {
        ...form,
        name: trimmedName,
        description: form.description.trim(),
        maxMembers: form.maxMembers ? Number(form.maxMembers) : null,
        levelRequirement: Number(form.levelRequirement),
      };
      const result = await roomsApi.create(payload);
      setForm(initialCreateForm);
      await refreshWorkspace();
      navigate(getRoomPath(result.room));
    } catch (nextError) {
      setError(nextError.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleJoin(room) {
    setJoiningRoomId(room.id);
    try {
      if (room.isMember) {
        navigate(getRoomPath(room));
        return;
      }

      const result = await roomsApi.join(room.id);
      await refreshWorkspace();
      navigate(getRoomPath(result.room));
    } catch (nextError) {
      setError(nextError.message);
    } finally {
      setJoiningRoomId(null);
    }
  }

  async function handleAcceptInvitation(invitationId, roomId) {
    setAcceptingInvitationId(invitationId);
    try {
      const result = await roomsApi.acceptInvitation(invitationId);
      await Promise.all([refreshWorkspace(), loadCatalog()]);
      navigate(getRoomPath(result.room ?? { id: roomId, category: "general" }));
    } catch (nextError) {
      setError(nextError.message);
    } finally {
      setAcceptingInvitationId(null);
    }
  }

  function updateCreateForm(key, value) {
    setForm(current => ({ ...current, [key]: value }));
  }

  function applyRoomPreset(preset) {
    setForm(current => {
      if (preset === "voice") {
        return {
          ...current,
          category: "voice",
          visibility: "public",
          voiceEnabled: true,
          videoEnabled: false,
          isListed: true,
        };
      }

      return {
        ...current,
        category: "general",
        voiceEnabled: false,
      };
    });
  }

  return (
    <div className="workspace-page">
      <section className="hero-panel hero-panel--discovery">
        <div>
          <p className="eyebrow">Open rooms and invitations</p>
          <h1>{isSearching ? "Room search" : "Rooms discovery"}</h1>
          <p>{heroDescription}</p>
          <small>{heroMeta}</small>
        </div>
        <div className="stack filters-card">
          <input
            className="text-input"
            placeholder="Search public rooms"
            value={filters.search}
            onChange={event => setFilters(current => ({ ...current, search: event.target.value }))}
          />
          <div className="inline-actions wrap-actions">
            <select
              className="text-input compact-input"
              value={filters.category}
              onChange={event => setFilters(current => ({ ...current, category: event.target.value }))}
            >
              <option value="all">All groups</option>
              <option value="general">General</option>
              <option value="study">Study</option>
              <option value="gaming">Gaming</option>
              <option value="hangout">Hangout</option>
              <option value="voice">Voice chat</option>
            </select>
            <select
              className="text-input compact-input"
              value={filters.sort}
              onChange={event => setFilters(current => ({ ...current, sort: event.target.value }))}
            >
              <option value="popular">Popular</option>
              <option value="online">Most active</option>
              <option value="newest">Newest</option>
              <option value="name">Alphabetical</option>
            </select>
          </div>
          <div className="inline-actions wrap-actions">
            <label className="toggle-chip">
              <input
                type="checkbox"
                checked={filters.onlyAvailable}
                onChange={event =>
                  setFilters(current => ({ ...current, onlyAvailable: event.target.checked }))
                }
              />
              <span>Free slots only</span>
            </label>
            <label className="toggle-chip">
              <input
                type="checkbox"
                checked={filters.voiceEnabled}
                onChange={event =>
                  setFilters(current => ({ ...current, voiceEnabled: event.target.checked }))
                }
              />
              <span>Voice-ready</span>
            </label>
            <label className="toggle-chip">
              <input
                type="checkbox"
                checked={filters.videoEnabled}
                onChange={event =>
                  setFilters(current => ({ ...current, videoEnabled: event.target.checked }))
                }
              />
              <span>Video-ready</span>
            </label>
          </div>
          {isSearching ? (
            <button
              type="button"
              className="ghost-button"
              onClick={() => setFilters(current => ({ ...current, search: "" }))}
            >
              Clear search
            </button>
          ) : null}
        </div>
      </section>

      {!isSearching ? (
        <div className="two-column-grid">
          <section className="panel-card">
            <div className="panel-card__header">
              <h2>Create room</h2>
            </div>
            <form className="stack" onSubmit={handleCreateRoom}>
              <div className="inline-actions wrap-actions">
                <button
                  type="button"
                  className={`ghost-button ${form.category !== "voice" ? "is-selected" : ""}`}
                  onClick={() => applyRoomPreset("standard")}
                >
                  Standard room
                </button>
                <button
                  type="button"
                  className={`ghost-button ${form.category === "voice" ? "is-selected" : ""}`}
                  onClick={() => applyRoomPreset("voice")}
                >
                  Voice chat
                </button>
              </div>
              <input
                className="text-input"
                placeholder="Unique room name"
                value={form.name}
                onChange={event => updateCreateForm("name", event.target.value)}
              />
              <textarea
                className="text-input"
                placeholder="Description"
                rows={4}
                value={form.description}
                onChange={event => updateCreateForm("description", event.target.value)}
              />
              <div className="inline-actions wrap-actions">
                <select
                  className="text-input compact-input"
                  value={form.visibility}
                  onChange={event => updateCreateForm("visibility", event.target.value)}
                >
                  <option value="public">Public room</option>
                  <option value="private">Private room</option>
                </select>
                <select
                  className="text-input compact-input"
                  value={form.category}
                  onChange={event => {
                    const nextCategory = event.target.value;
                    setForm(current => ({
                      ...current,
                      category: nextCategory,
                      voiceEnabled:
                        nextCategory === "voice" ? true : current.voiceEnabled,
                    }));
                  }}
                >
                  <option value="general">General group</option>
                  <option value="study">Study group</option>
                  <option value="gaming">Gaming party</option>
                  <option value="hangout">Hangout room</option>
                  <option value="voice">Voice chat</option>
                </select>
              </div>
              <div className="inline-actions wrap-actions">
                <input
                  className="text-input compact-input"
                  type="number"
                  min="2"
                  max="1000"
                  placeholder="Max participants"
                  value={form.maxMembers}
                  onChange={event => updateCreateForm("maxMembers", event.target.value)}
                />
                <input
                  className="text-input compact-input"
                  type="number"
                  min="1"
                  max="100"
                  value={form.levelRequirement}
                  onChange={event => updateCreateForm("levelRequirement", event.target.value)}
                />
              </div>
              <div className="inline-actions wrap-actions">
                <label className="toggle-chip">
                  <input
                    type="checkbox"
                    checked={form.voiceEnabled}
                    onChange={event => updateCreateForm("voiceEnabled", event.target.checked)}
                  />
                  <span>{form.category === "voice" ? "Voice enabled" : "Voice ready"}</span>
                </label>
                <label className="toggle-chip">
                  <input
                    type="checkbox"
                    checked={form.videoEnabled}
                    onChange={event => updateCreateForm("videoEnabled", event.target.checked)}
                  />
                  <span>Video ready</span>
                </label>
                {form.visibility === "public" ? (
                  <label className="toggle-chip">
                    <input
                      type="checkbox"
                      checked={form.isListed}
                      onChange={event => updateCreateForm("isListed", event.target.checked)}
                    />
                    <span>Show in discovery</span>
                  </label>
                ) : null}
              </div>
              <small>
                Public rooms can be discovered and joined. Private rooms stay invite-only.
                Voice chat rooms open directly in the voice lounge.
              </small>
              {error ? <p className="error-text">{error}</p> : null}
              <button
                type="submit"
                className="primary-button"
                disabled={isSubmitting}
                aria-busy={isSubmitting}
              >
                {isSubmitting ? "Creating..." : "Create room"}
              </button>
            </form>
          </section>

          <section className="panel-card">
            <div className="panel-card__header">
              <h2>Invitations</h2>
            </div>
            <div className="stack">
              {invitations.map(invitation => (
                <div key={invitation.id} className="catalog-card">
                  <div>
                    <strong>{invitation.room.name}</strong>
                    <p>{invitation.room.description || "Private room invitation"}</p>
                    <small>Invited by {invitation.inviter?.username ?? "room admin"}</small>
                  </div>
                  <button
                    type="button"
                    className="primary-button"
                    disabled={acceptingInvitationId === invitation.id}
                    aria-busy={acceptingInvitationId === invitation.id}
                    onClick={() => handleAcceptInvitation(invitation.id, invitation.room.id)}
                  >
                    {acceptingInvitationId === invitation.id ? "Opening..." : "Accept"}
                  </button>
                </div>
              ))}
              {!invitations.length ? (
                <EmptyState title="No invitations" description="Private room invites will appear here." />
              ) : null}
            </div>
          </section>
        </div>
      ) : null}

      <section className="panel-card">
        <div className="panel-card__header discovery-results__header">
          <div className="stack compact-stack discovery-results__context">
            <p className="eyebrow">{isSearching ? "Search results" : "Open rooms"}</p>
            <h2>{isSearching ? `Results for "${searchQuery}"` : "Open rooms"}</h2>
            <small>
              {isSearching
                ? `Showing ${rooms.length} ${rooms.length === 1 ? "room" : "rooms"} that match your search.`
                : `Your level: ${currentUser?.level ?? 1}`}
            </small>
          </div>
          {isSearching ? (
            <button
              type="button"
              className="ghost-button"
              onClick={() => setFilters(current => ({ ...current, search: "" }))}
            >
              Back to discovery
            </button>
          ) : null}
        </div>
        <div className="catalog-grid">
          {rooms.map(room => (
            <div key={room.id} className="catalog-card room-card">
              <div className="stack compact-stack">
                <strong>{room.name}</strong>
                <p>{room.description || "No description yet."}</p>
                <div className="inline-actions wrap-actions">
                  <span className="stat-chip">{room.category}</span>
                  <span className="stat-chip">
                    {room.memberCount}/{room.maxMembers ?? "unlimited"} members
                  </span>
                  <span className="stat-chip">{room.onlineCount} active</span>
                  <span className="stat-chip">Lv {room.levelRequirement}+</span>
                  {room.voiceEnabled ? <span className="stat-chip">Voice</span> : null}
                  {room.videoEnabled ? <span className="stat-chip">Video</span> : null}
                </div>
              </div>
              <button
                type="button"
                className="primary-button"
                onClick={() => handleJoin(room)}
                disabled={joiningRoomId === room.id || (!room.isMember && room.isFull)}
                aria-busy={joiningRoomId === room.id}
              >
                {joiningRoomId === room.id
                  ? room.isMember
                    ? "Opening..."
                    : "Joining..."
                  : room.isMember
                    ? room.category === "voice"
                      ? "Open voice"
                      : "Open chat"
                    : room.isFull
                      ? "Room full"
                      : room.category === "voice"
                        ? "Join voice"
                        : "Join room"}
              </button>
            </div>
          ))}
          {!rooms.length ? (
            <EmptyState
              title="No public rooms found"
              description="Try another search or create a new group that fits your filters."
            />
          ) : null}
        </div>
      </section>
    </div>
  );
}
