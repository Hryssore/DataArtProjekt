import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useOutletContext, useParams } from "react-router-dom";

import { adminApi } from "../api/adminApi.js";
import { attachmentsApi } from "../api/attachmentsApi.js";
import { friendsApi } from "../api/friendsApi.js";
import { messagesApi } from "../api/messagesApi.js";
import { roomsApi } from "../api/roomsApi.js";
import { usersApi } from "../api/usersApi.js";
import {
  BansModal,
  ConfirmDeleteRoomModal,
  MemberAdminModal,
} from "../components/chat/AdminActionsModal.jsx";
import { ChatHeader } from "../components/chat/ChatHeader.jsx";
import { MessageEditModal } from "../components/chat/MessageEditModal.jsx";
import { MemberList } from "../components/chat/MemberList.jsx";
import { MessageComposer } from "../components/chat/MessageComposer.jsx";
import { MessageList } from "../components/chat/MessageList.jsx";
import { AvatarBadge } from "../components/ui/AvatarBadge.jsx";
import { EmptyState } from "../components/ui/EmptyState.jsx";
import { useInfiniteMessages } from "../hooks/useInfiniteMessages.js";
import { useSocket } from "../socket/SocketProvider.jsx";
import { useUiPreferences } from "../app/store/UiPreferencesStore.jsx";

const DISCUSSION_TOPIC_PREFIX = "[Discussion] ";

function normalizeInviteSearchQuery(value) {
  return value.trim().replace(/^@+/, "");
}

function parseBoardEntry(goal) {
  const isDiscussion = goal.title.startsWith(DISCUSSION_TOPIC_PREFIX);

  return {
    ...goal,
    entryType: isDiscussion ? "discussion" : "goal",
    displayTitle: isDiscussion ? goal.title.slice(DISCUSSION_TOPIC_PREFIX.length) : goal.title,
  };
}

function formatTypingText(users) {
  if (!users.length) {
    return "";
  }

  const labels = users.map(user => user.displayName || user.username);
  if (labels.length === 1) {
    return `${labels[0]} is typing...`;
  }

  if (labels.length === 2) {
    return `${labels[0]} and ${labels[1]} are typing...`;
  }

  if (labels.length === 3) {
    return `${labels[0]}, ${labels[1]}, and ${labels[2]} are typing...`;
  }

  return `${labels[0]}, ${labels[1]}, and ${labels.length - 2} others are typing...`;
}

function VoiceMicBadge({ muted, speaking }) {
  const state = muted ? "muted" : speaking ? "speaking" : "active";
  const label = muted ? "Mic off" : speaking ? "Picking up voice" : "Mic on";

  return (
    <span className={`voice-mic-badge is-${state}`} aria-label={label} title={label}>
      <span className="voice-mic-badge__icon" aria-hidden="true">
        <span className="voice-mic-badge__capsule" />
        <span className="voice-mic-badge__stem" />
        <span className="voice-mic-badge__base" />
        {muted ? <span className="voice-mic-badge__slash" /> : null}
        {speaking ? <span className="voice-mic-badge__pulse" /> : null}
      </span>
      <span>{label}</span>
    </span>
  );
}

export function RoomChatPage() {
  const { roomId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const workspace = useOutletContext();
  const { socket } = useSocket();
  const { rememberRoomVisit } = useUiPreferences();
  const requestedPane = new URLSearchParams(location.search).get("pane");
  const [room, setRoom] = useState(null);
  const [members, setMembers] = useState([]);
  const [replyTo, setReplyTo] = useState(null);
  const [selectedMember, setSelectedMember] = useState(null);
  const [bans, setBans] = useState([]);
  const [showBansModal, setShowBansModal] = useState(false);
  const [showDeleteRoomModal, setShowDeleteRoomModal] = useState(false);
  const [activePane, setActivePane] = useState("chat");
  const [isDiscussionVisible, setIsDiscussionVisible] = useState(true);
  const [inviteQuery, setInviteQuery] = useState("");
  const [inviteResults, setInviteResults] = useState([]);
  const [inviteSearchCompletedQuery, setInviteSearchCompletedQuery] = useState("");
  const [goals, setGoals] = useState([]);
  const [voiceParticipants, setVoiceParticipants] = useState([]);
  const [typingUsers, setTypingUsers] = useState([]);
  const [outgoingFriendRequestUserIds, setOutgoingFriendRequestUserIds] = useState([]);
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [isSearchingInvite, setIsSearchingInvite] = useState(false);
  const [invitingUserId, setInvitingUserId] = useState(null);
  const [friendRequestUserId, setFriendRequestUserId] = useState(null);
  const [isLoadingBans, setIsLoadingBans] = useState(false);
  const [moderationActionKey, setModerationActionKey] = useState("");
  const [isDeletingRoom, setIsDeletingRoom] = useState(false);
  const [isLeavingRoom, setIsLeavingRoom] = useState(false);
  const [goalActionKey, setGoalActionKey] = useState("");
  const [composerError, setComposerError] = useState("");
  const [voiceError, setVoiceError] = useState("");
  const [voiceStatus, setVoiceStatus] = useState("");
  const [isJoiningVoice, setIsJoiningVoice] = useState(false);
  const [voiceSession, setVoiceSession] = useState({
    joined: false,
    muted: false,
    cameraEnabled: false,
    speaking: false,
    screenSharing: false,
  });
  const [goalForm, setGoalForm] = useState({
    mode: "goal",
    title: "",
    description: "",
    steps: [],
    resources: [],
  });
  const [goalError, setGoalError] = useState("");
  const [goalStatus, setGoalStatus] = useState("");
  const [editingGoalId, setEditingGoalId] = useState(null);
  const [editingGoalDraft, setEditingGoalDraft] = useState({
    title: "",
    description: "",
  });
  const [editingMessage, setEditingMessage] = useState(null);
  const [isSavingEditedMessage, setIsSavingEditedMessage] = useState(false);
  const [editMessageError, setEditMessageError] = useState("");
  const localVoicePreviewRef = useRef(null);
  const localVoiceStreamRef = useRef(null);
  const screenShareStreamRef = useRef(null);
  const peerConnectionsRef = useRef(new Map());
  const remoteVoiceStreamsRef = useRef(new Map());
  const pendingIceCandidatesRef = useRef(new Map());
  const voiceSessionRef = useRef({
    joined: false,
    muted: false,
    cameraEnabled: false,
    speaking: false,
    screenSharing: false,
  });
  const audioContextRef = useRef(null);
  const audioAnalyserRef = useRef(null);
  const audioSourceRef = useRef(null);
  const speakingFrameRef = useRef(null);
  const speakingStateRef = useRef(false);
  const inviteSearchRequestRef = useRef(0);
  const [localVoiceVersion, setLocalVoiceVersion] = useState(0);
  const [remoteVoiceStreams, setRemoteVoiceStreams] = useState([]);

  const canModerate = Boolean(room?.isAdmin || room?.isOwner);
  const canDeleteRoom = Boolean(room?.isOwner);
  const canLeaveRoom = Boolean(room?.isMember && !room?.isOwner);
  const canInvite = Boolean(canModerate && room?.visibility === "private");
  const friendUserIds = useMemo(
    () => (workspace.friends ?? []).map(friend => friend.id),
    [workspace.friends],
  );
  const normalizedInviteQuery = useMemo(
    () => normalizeInviteSearchQuery(inviteQuery),
    [inviteQuery],
  );

  const runInviteSearch = useCallback(async rawQuery => {
    const normalizedQuery = normalizeInviteSearchQuery(rawQuery);

    if (!normalizedQuery) {
      inviteSearchRequestRef.current += 1;
      setInviteResults([]);
      setInviteSearchCompletedQuery("");
      setIsSearchingInvite(false);
      return;
    }

    const requestId = inviteSearchRequestRef.current + 1;
    inviteSearchRequestRef.current = requestId;
    setIsSearchingInvite(true);

    try {
      const result = await usersApi.search(normalizedQuery);
      if (inviteSearchRequestRef.current !== requestId) {
        return;
      }

      setInviteResults(result.users);
      setInviteSearchCompletedQuery(normalizedQuery);
    } catch (error) {
      if (inviteSearchRequestRef.current !== requestId) {
        return;
      }

      setInviteResults([]);
      setInviteSearchCompletedQuery(normalizedQuery);
      throw error;
    } finally {
      if (inviteSearchRequestRef.current === requestId) {
        setIsSearchingInvite(false);
      }
    }
  }, []);

  useEffect(() => {
    voiceSessionRef.current = voiceSession;
  }, [voiceSession]);

  const roomHistoryLoader = useCallback(
    query => messagesApi.listRoom(roomId, { limit: 30, ...query }),
    [roomId],
  );

  const messageFeed = useInfiniteMessages(roomHistoryLoader);

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

  const loadRoomData = useCallback(async () => {
    const [roomResult, membersResult, goalsResult, requestsResult] = await Promise.all([
      roomsApi.getById(roomId),
      roomsApi.listMembers(roomId),
      roomsApi.listGoals(roomId),
      friendsApi.listRequests(),
    ]);

    setRoom(roomResult.room);
    setMembers(membersResult.members);
    setGoals(goalsResult.goals);
    setOutgoingFriendRequestUserIds(
      requestsResult.requests
        .filter(request => request.direction === "outgoing" && request.status === "pending")
        .map(request => request.receiver.id),
    );
  }, [roomId]);

  useEffect(() => {
    loadRoomData().catch(() => navigate("/rooms"));
  }, [loadRoomData, navigate]);

  useEffect(() => {
    if (room?.id && room.isMember) {
      rememberRoomVisit(room);
    }
  }, [
    rememberRoomVisit,
    room?.category,
    room?.id,
    room?.isMember,
    room?.name,
    room?.visibility,
  ]);

  useEffect(() => {
    if (socket) {
      socket.emit("room:subscribe", { roomId });
    }
  }, [roomId, socket]);

  useEffect(() => {
    setOutgoingFriendRequestUserIds(current =>
      current.filter(userId => !friendUserIds.includes(userId)),
    );
  }, [friendUserIds]);

  useEffect(() => {
    if (activePane !== "people" || !canInvite) {
      inviteSearchRequestRef.current += 1;
      setInviteQuery("");
      setInviteResults([]);
      setInviteSearchCompletedQuery("");
      setIsSearchingInvite(false);
      return undefined;
    }

    if (!normalizedInviteQuery) {
      setInviteResults([]);
      setInviteSearchCompletedQuery("");
      setIsSearchingInvite(false);
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      runInviteSearch(inviteQuery).catch(() => {});
    }, 240);

    return () => window.clearTimeout(timeoutId);
  }, [activePane, canInvite, inviteQuery, normalizedInviteQuery, runInviteSearch]);

  useEffect(() => {
    const nextVoiceSession = {
      joined: false,
      muted: false,
      cameraEnabled: false,
      speaking: false,
      screenSharing: false,
    };

    setActivePane(requestedPane === "voice" ? "voice" : "chat");
    setReplyTo(null);
    setComposerError("");
    setGoalError("");
    setGoalStatus("");
    setEditingGoalId(null);
    setEditingGoalDraft({ title: "", description: "" });
    setVoiceError("");
    setVoiceStatus("");
    setIsDiscussionVisible(true);
    setVoiceParticipants([]);
    setTypingUsers([]);
    setEditingMessage(null);
    setEditMessageError("");
    voiceSessionRef.current = nextVoiceSession;
    speakingStateRef.current = false;
    setVoiceSession(nextVoiceSession);
  }, [requestedPane, roomId]);

  useEffect(() => {
    if (!room) {
      return;
    }

    if (requestedPane === "voice") {
      setActivePane("voice");
      return;
    }

    if (room.category === "voice") {
      setActivePane(current => (current === "chat" ? "voice" : current));
    }
  }, [requestedPane, room?.category, room?.id]);

  useEffect(() => {
    if (!socket) {
      return;
    }

    function handleCreated(event) {
      if (event.roomId === roomId) {
        messageFeed.setMessages(current => mergeMessage(current, event.message));
        setRoom(current =>
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
      if (event.roomId === roomId) {
        messageFeed.setMessages(current =>
          current.map(message => (message.id === event.message.id ? event.message : message)),
        );
      }
    }

    function handleDeleted(event) {
      if (event.roomId === roomId) {
        messageFeed.setMessages(current =>
          current.map(message => (message.id === event.message.id ? event.message : message)),
        );
        setRoom(current =>
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
      if (event.roomId === roomId) {
        messageFeed.setMessages(current => mergeAttachments(current, event));
      }
    }

    function handleRoomDeleted(event) {
      if (event.roomId === roomId) {
        navigate("/rooms");
      }
    }

    function handleRoomBanned(event) {
      if (event.roomId === roomId) {
        navigate("/rooms");
      }
    }

    function handlePresenceUpdate() {
      loadRoomData().catch(() => undefined);
    }

    function handleRoomRefresh(event) {
      if (event.roomId === roomId) {
        loadRoomData().catch(() => undefined);
      }
    }

    function handleTypingState(event) {
      if (event.roomId !== roomId) {
        return;
      }

      setTypingUsers(
        (event.users ?? []).filter(user => user.userId !== workspace.currentUser?.id),
      );
    }

    socket.on("message:created", handleCreated);
    socket.on("message:updated", handleUpdated);
    socket.on("message:deleted", handleDeleted);
    socket.on("message:attachments-added", handleAttachments);
    socket.on("room:deleted", handleRoomDeleted);
    socket.on("room:banned", handleRoomBanned);
    socket.on("presence:update", handlePresenceUpdate);
    socket.on("room:members-updated", handleRoomRefresh);
    socket.on("room:admins-updated", handleRoomRefresh);
    socket.on("room:goals-updated", handleRoomRefresh);
    socket.on("room:topic-updated", handleRoomRefresh);
    socket.on("room:typing-state", handleTypingState);

    return () => {
      socket.off("message:created", handleCreated);
      socket.off("message:updated", handleUpdated);
      socket.off("message:deleted", handleDeleted);
      socket.off("message:attachments-added", handleAttachments);
      socket.off("room:deleted", handleRoomDeleted);
      socket.off("room:banned", handleRoomBanned);
      socket.off("presence:update", handlePresenceUpdate);
      socket.off("room:members-updated", handleRoomRefresh);
      socket.off("room:admins-updated", handleRoomRefresh);
      socket.off("room:goals-updated", handleRoomRefresh);
      socket.off("room:topic-updated", handleRoomRefresh);
      socket.off("room:typing-state", handleTypingState);
    };
  }, [
    loadRoomData,
    mergeAttachments,
    mergeMessage,
    messageFeed.setMessages,
    navigate,
    roomId,
    socket,
    workspace.currentUser?.id,
  ]);

  useEffect(() => {
    const lastMessage = messageFeed.messages.at(-1);
    if (!lastMessage) {
      return;
    }

    messagesApi.markRoomRead(roomId, { lastReadMessageId: lastMessage.id }).catch(() => undefined);
  }, [messageFeed.messages, roomId]);

  const stopVoiceMetering = useCallback(() => {
    if (speakingFrameRef.current) {
      cancelAnimationFrame(speakingFrameRef.current);
      speakingFrameRef.current = null;
    }

    if (audioSourceRef.current) {
      audioSourceRef.current.disconnect();
      audioSourceRef.current = null;
    }

    if (audioAnalyserRef.current) {
      audioAnalyserRef.current.disconnect();
      audioAnalyserRef.current = null;
    }

    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => undefined);
      audioContextRef.current = null;
    }

    speakingStateRef.current = false;
    voiceSessionRef.current = {
      ...voiceSessionRef.current,
      speaking: false,
    };
    setVoiceSession(current => (current.speaking ? { ...current, speaking: false } : current));
  }, []);

  const emitVoicePresence = useCallback(
    overrides => {
      const currentSession = voiceSessionRef.current;
      socket?.emit("voice:update", {
        roomId,
        muted: overrides?.muted ?? currentSession.muted,
        cameraEnabled: overrides?.cameraEnabled ?? currentSession.cameraEnabled,
        speaking: overrides?.speaking ?? currentSession.speaking,
        screenSharing: overrides?.screenSharing ?? currentSession.screenSharing,
      });
    },
    [roomId, socket],
  );

  const syncRemoteVoiceStreams = useCallback(() => {
    setRemoteVoiceStreams(
      [...remoteVoiceStreamsRef.current.entries()].map(([socketId, stream]) => ({
        socketId,
        stream,
      })),
    );
  }, []);

  const closeVoicePeerConnection = useCallback(
    targetSocketId => {
      const peerConnection = peerConnectionsRef.current.get(targetSocketId);
      if (peerConnection) {
        peerConnection.onicecandidate = null;
        peerConnection.ontrack = null;
        peerConnection.onconnectionstatechange = null;
        peerConnection.close();
        peerConnectionsRef.current.delete(targetSocketId);
      }

      pendingIceCandidatesRef.current.delete(targetSocketId);

      if (remoteVoiceStreamsRef.current.delete(targetSocketId)) {
        syncRemoteVoiceStreams();
      }
    },
    [syncRemoteVoiceStreams],
  );

  const clearVoicePeerConnections = useCallback(() => {
    [...peerConnectionsRef.current.keys()].forEach(targetSocketId => {
      closeVoicePeerConnection(targetSocketId);
    });

    remoteVoiceStreamsRef.current.clear();
    setRemoteVoiceStreams([]);
  }, [closeVoicePeerConnection]);

  const emitVoiceSignal = useCallback(
    (targetSocketId, payload) => {
      socket?.emit("voice:signal", {
        roomId,
        targetSocketId,
        ...payload,
      });
    },
    [roomId, socket],
  );

  const createVoicePeerConnection = useCallback(
    targetSocketId => {
      if (peerConnectionsRef.current.has(targetSocketId)) {
        return peerConnectionsRef.current.get(targetSocketId);
      }

      const peerConnection = new RTCPeerConnection();

      peerConnection.onicecandidate = event => {
        if (!event.candidate) {
          return;
        }

        emitVoiceSignal(targetSocketId, {
          candidate: event.candidate.toJSON(),
        });
      };

      peerConnection.ontrack = event => {
        const [stream] = event.streams;
        if (!stream) {
          return;
        }

        remoteVoiceStreamsRef.current.set(targetSocketId, stream);
        syncRemoteVoiceStreams();
      };

      peerConnection.onconnectionstatechange = () => {
        if (["failed", "closed", "disconnected"].includes(peerConnection.connectionState)) {
          closeVoicePeerConnection(targetSocketId);
        }
      };

      const localStream = localVoiceStreamRef.current;
      localStream?.getAudioTracks().forEach(track => {
        peerConnection.addTrack(track, localStream);
      });

      peerConnectionsRef.current.set(targetSocketId, peerConnection);
      return peerConnection;
    },
    [closeVoicePeerConnection, emitVoiceSignal, syncRemoteVoiceStreams],
  );

  const startVoiceMetering = useCallback(
    stream => {
      stopVoiceMetering();

      const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextCtor || stream.getAudioTracks().length === 0) {
        return;
      }

      try {
        const audioContext = new AudioContextCtor();
        const analyser = audioContext.createAnalyser();
        const source = audioContext.createMediaStreamSource(stream);
        const sampleBuffer = new Uint8Array(1024);

        analyser.fftSize = 1024;
        analyser.smoothingTimeConstant = 0.82;
        source.connect(analyser);

        audioContextRef.current = audioContext;
        audioAnalyserRef.current = analyser;
        audioSourceRef.current = source;

        audioContext.resume().catch(() => undefined);

        const measure = () => {
          analyser.getByteTimeDomainData(sampleBuffer);

          let sumSquares = 0;
          for (let index = 0; index < sampleBuffer.length; index += 1) {
            const normalized = (sampleBuffer[index] - 128) / 128;
            sumSquares += normalized * normalized;
          }

          const rms = Math.sqrt(sumSquares / sampleBuffer.length);
          const threshold = speakingStateRef.current ? 0.045 : 0.06;
          const nextSpeaking = !voiceSessionRef.current.muted && rms >= threshold;

          if (nextSpeaking !== speakingStateRef.current) {
            speakingStateRef.current = nextSpeaking;
            setVoiceSession(current =>
              current.speaking === nextSpeaking ? current : { ...current, speaking: nextSpeaking },
            );
            emitVoicePresence({ speaking: nextSpeaking });
          }

          speakingFrameRef.current = requestAnimationFrame(measure);
        };

        speakingFrameRef.current = requestAnimationFrame(measure);
      } catch {
        stopVoiceMetering();
      }
    },
    [emitVoicePresence, stopVoiceMetering],
  );

  const stopScreenShare = useCallback(
    (options = {}) => {
      const stream = screenShareStreamRef.current;
      if (stream) {
        stream.getTracks().forEach(track => {
          track.onended = null;
          track.stop();
        });
        screenShareStreamRef.current = null;
        setLocalVoiceVersion(current => current + 1);
      }

      if (!voiceSessionRef.current.screenSharing) {
        return;
      }

      const nextVoiceSession = {
        ...voiceSessionRef.current,
        screenSharing: false,
      };

      voiceSessionRef.current = nextVoiceSession;
      setVoiceSession(nextVoiceSession);

      if (options.emitUpdate !== false && nextVoiceSession.joined) {
        emitVoicePresence({
          muted: nextVoiceSession.muted,
          cameraEnabled: nextVoiceSession.cameraEnabled,
          speaking: nextVoiceSession.speaking,
          screenSharing: nextVoiceSession.screenSharing,
        });
      }

      if (!options.silentStatus) {
        setVoiceStatus("Screen sharing stopped.");
      }
    },
    [emitVoicePresence],
  );

  const stopLocalVoiceStream = useCallback(() => {
    stopScreenShare({ emitUpdate: false, silentStatus: true });
    stopVoiceMetering();
    const stream = localVoiceStreamRef.current;
    if (!stream) {
      return;
    }

    stream.getTracks().forEach(track => track.stop());
    localVoiceStreamRef.current = null;
    setLocalVoiceVersion(current => current + 1);
  }, [stopScreenShare, stopVoiceMetering]);

  useEffect(() => {
    if (!localVoicePreviewRef.current) {
      return;
    }

    localVoicePreviewRef.current.srcObject =
      screenShareStreamRef.current ?? (voiceSession.cameraEnabled ? localVoiceStreamRef.current : null);
  }, [localVoiceVersion, voiceSession.cameraEnabled, voiceSession.joined, voiceSession.screenSharing]);

  useEffect(() => {
    if (!socket || !room?.isMember) {
      return;
    }

    function handleVoiceParticipants(event) {
      if (event.roomId !== roomId) {
        return;
      }

      setVoiceParticipants(event.participants ?? []);
    }

    socket.on("voice:participants", handleVoiceParticipants);
    socket.emit("voice:state:request", { roomId });

    return () => {
      socket.off("voice:participants", handleVoiceParticipants);
    };
  }, [room?.isMember, roomId, socket]);

  useEffect(() => {
    if (!socket) {
      return;
    }

    async function handleVoiceSignal(event) {
      if (event.roomId !== roomId || !voiceSessionRef.current.joined) {
        return;
      }

      const targetSocketId = event.senderSocketId;
      if (!targetSocketId || targetSocketId === socket.id) {
        return;
      }

      const peerConnection = createVoicePeerConnection(targetSocketId);

      if (event.description) {
        await peerConnection.setRemoteDescription(event.description);

        const queuedCandidates = pendingIceCandidatesRef.current.get(targetSocketId) ?? [];
        for (const candidate of queuedCandidates) {
          try {
            await peerConnection.addIceCandidate(candidate);
          } catch {
            // Ignore stale ICE candidates from reconnecting peers.
          }
        }
        pendingIceCandidatesRef.current.delete(targetSocketId);

        if (event.description.type === "offer") {
          const answer = await peerConnection.createAnswer();
          await peerConnection.setLocalDescription(answer);
          emitVoiceSignal(targetSocketId, {
            description: peerConnection.localDescription?.toJSON?.() ?? peerConnection.localDescription,
          });
        }

        return;
      }

      if (event.candidate) {
        if (!peerConnection.remoteDescription) {
          const queuedCandidates = pendingIceCandidatesRef.current.get(targetSocketId) ?? [];
          queuedCandidates.push(event.candidate);
          pendingIceCandidatesRef.current.set(targetSocketId, queuedCandidates);
          return;
        }

        try {
          await peerConnection.addIceCandidate(event.candidate);
        } catch {
          // Ignore stale ICE candidates from reconnecting peers.
        }
      }
    }

    socket.on("voice:signal", handleVoiceSignal);

    return () => {
      socket.off("voice:signal", handleVoiceSignal);
    };
  }, [createVoicePeerConnection, emitVoiceSignal, roomId, socket]);

  useEffect(() => {
    if (!voiceSession.joined || !socket?.id) {
      clearVoicePeerConnections();
      return;
    }

    const activeRemoteParticipants = voiceParticipants.filter(
      participant => participant.socketId !== socket.id,
    );
    const activeSocketIds = new Set(activeRemoteParticipants.map(participant => participant.socketId));

    [...peerConnectionsRef.current.keys()].forEach(targetSocketId => {
      if (!activeSocketIds.has(targetSocketId)) {
        closeVoicePeerConnection(targetSocketId);
      }
    });

    const syncConnections = async () => {
      for (const participant of activeRemoteParticipants) {
        const targetSocketId = participant.socketId;
        const peerConnection = createVoicePeerConnection(targetSocketId);

        if (socket.id < targetSocketId && !peerConnection.localDescription) {
          const offer = await peerConnection.createOffer();
          await peerConnection.setLocalDescription(offer);
          emitVoiceSignal(targetSocketId, {
            description:
              peerConnection.localDescription?.toJSON?.() ?? peerConnection.localDescription,
          });
        }
      }
    };

    syncConnections().catch(() => undefined);
  }, [
    clearVoicePeerConnections,
    closeVoicePeerConnection,
    createVoicePeerConnection,
    emitVoiceSignal,
    socket?.id,
    voiceParticipants,
    voiceSession.joined,
  ]);

  useEffect(() => {
    return () => {
      if (socket) {
        socket.emit("voice:leave", { roomId });
      }
      clearVoicePeerConnections();
      stopLocalVoiceStream();
    };
  }, [clearVoicePeerConnections, roomId, socket, stopLocalVoiceStream]);

  async function handleJoinVoice(withCamera = false) {
    if (voiceSession.joined || isJoiningVoice) {
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setVoiceError("Voice is not supported in this browser.");
      return;
    }

    setVoiceError("");
    setVoiceStatus("");
    setIsJoiningVoice(true);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: Boolean(withCamera && room?.videoEnabled),
      });
      stream.getAudioTracks().forEach(track => {
        track.enabled = false;
      });

      const nextVoiceSession = {
        joined: true,
        muted: true,
        cameraEnabled: stream.getVideoTracks().length > 0,
        speaking: false,
        screenSharing: false,
      };

      localVoiceStreamRef.current = stream;
      setLocalVoiceVersion(current => current + 1);
      voiceSessionRef.current = nextVoiceSession;
      setVoiceSession(nextVoiceSession);
      startVoiceMetering(stream);
      setVoiceStatus("You joined the voice lounge. Your mic starts muted.");
      socket?.emit("voice:join", {
        roomId,
        muted: nextVoiceSession.muted,
        cameraEnabled: nextVoiceSession.cameraEnabled,
        speaking: nextVoiceSession.speaking,
        screenSharing: nextVoiceSession.screenSharing,
      });
    } catch (error) {
      setVoiceError(error?.message || "Microphone access was denied.");
    } finally {
      setIsJoiningVoice(false);
    }
  }

  function handleLeaveVoice() {
    const nextVoiceSession = {
      joined: false,
      muted: false,
      cameraEnabled: false,
      speaking: false,
      screenSharing: false,
    };

    clearVoicePeerConnections();
    stopLocalVoiceStream();
    voiceSessionRef.current = nextVoiceSession;
    setVoiceSession(nextVoiceSession);
    setVoiceStatus("You left the voice lounge.");
    setVoiceError("");
    socket?.emit("voice:leave", { roomId });
  }

  function handleToggleMute() {
    const stream = localVoiceStreamRef.current;
    if (!stream) {
      return;
    }

    const nextMuted = !voiceSession.muted;
    const nextVoiceSession = {
      ...voiceSessionRef.current,
      muted: nextMuted,
      speaking: false,
    };

    speakingStateRef.current = false;
    stream.getAudioTracks().forEach(track => {
      track.enabled = !nextMuted;
    });
    voiceSessionRef.current = nextVoiceSession;
    setVoiceSession(nextVoiceSession);
    emitVoicePresence({
      muted: nextVoiceSession.muted,
      cameraEnabled: nextVoiceSession.cameraEnabled,
      speaking: nextVoiceSession.speaking,
      screenSharing: nextVoiceSession.screenSharing,
    });
  }

  async function handleToggleCamera() {
    if (!room?.videoEnabled) {
      return;
    }

    const stream = localVoiceStreamRef.current;
    if (!stream) {
      await handleJoinVoice(true);
      return;
    }

    const currentVideoTrack = stream.getVideoTracks()[0];
    if (currentVideoTrack) {
      const nextVoiceSession = {
        ...voiceSessionRef.current,
        cameraEnabled: false,
      };

      currentVideoTrack.stop();
      stream.removeTrack(currentVideoTrack);
      voiceSessionRef.current = nextVoiceSession;
      setVoiceSession(nextVoiceSession);
      setLocalVoiceVersion(current => current + 1);
      emitVoicePresence({
        muted: nextVoiceSession.muted,
        cameraEnabled: nextVoiceSession.cameraEnabled,
        speaking: nextVoiceSession.speaking,
        screenSharing: nextVoiceSession.screenSharing,
      });
      return;
    }

    try {
      const cameraStream = await navigator.mediaDevices.getUserMedia({ video: true });
      const cameraTrack = cameraStream.getVideoTracks()[0];
      if (!cameraTrack) {
        return;
      }

      stream.addTrack(cameraTrack);
      const nextVoiceSession = {
        ...voiceSessionRef.current,
        cameraEnabled: true,
      };

      voiceSessionRef.current = nextVoiceSession;
      setVoiceSession(nextVoiceSession);
      setLocalVoiceVersion(current => current + 1);
      emitVoicePresence({
        muted: nextVoiceSession.muted,
        cameraEnabled: nextVoiceSession.cameraEnabled,
        speaking: nextVoiceSession.speaking,
        screenSharing: nextVoiceSession.screenSharing,
      });
    } catch (error) {
      setVoiceError(error?.message || "Camera access was denied.");
    }
  }

  async function handleToggleScreenShare() {
    if (!voiceSession.joined) {
      setVoiceError("Join voice first before sharing your screen.");
      return;
    }

    if (voiceSession.screenSharing) {
      stopScreenShare();
      return;
    }

    if (!navigator.mediaDevices?.getDisplayMedia) {
      setVoiceError("Screen sharing is not supported in this browser.");
      return;
    }

    try {
      setVoiceError("");
      const displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false,
      });
      const displayTrack = displayStream.getVideoTracks()[0];
      if (!displayTrack) {
        return;
      }

      displayTrack.onended = () => {
        stopScreenShare({ silentStatus: false });
      };

      screenShareStreamRef.current = displayStream;
      setLocalVoiceVersion(current => current + 1);

      const nextVoiceSession = {
        ...voiceSessionRef.current,
        screenSharing: true,
      };

      voiceSessionRef.current = nextVoiceSession;
      setVoiceSession(nextVoiceSession);
      setVoiceStatus("Screen share started.");
      emitVoicePresence({
        muted: nextVoiceSession.muted,
        cameraEnabled: nextVoiceSession.cameraEnabled,
        speaking: nextVoiceSession.speaking,
        screenSharing: nextVoiceSession.screenSharing,
      });
    } catch (error) {
      setVoiceError(error?.message || "Screen sharing could not be started.");
    }
  }

  async function handleSend(payload) {
    setIsSendingMessage(true);
    setComposerError("");
    try {
      const result = await messagesApi.sendRoom(roomId, {
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
    const result =
      canModerate && message.sender.id !== workspace.currentUser?.id
        ? await adminApi.deleteMessage(roomId, message.id)
        : await messagesApi.remove(message.id);

    messageFeed.setMessages(current =>
      current.map(item => (item.id === message.id ? result.message : item)),
    );
  }

  async function handleLoadBans() {
    setIsLoadingBans(true);
    try {
      const result = await adminApi.listBans(roomId);
      setBans(result.bans);
      setShowBansModal(true);
    } finally {
      setIsLoadingBans(false);
    }
  }

  async function handleSearchInvite() {
    try {
      await runInviteSearch(inviteQuery);
    } catch {
      // Keep the drawer responsive even if the live lookup fails.
    }
  }

  async function handleInvite(userId) {
    setInvitingUserId(userId);
    try {
      await roomsApi.invite(roomId, userId);
      setInviteQuery("");
      setInviteResults([]);
      setInviteSearchCompletedQuery("");
    } finally {
      setInvitingUserId(null);
    }
  }

  async function handleRequestFriend(member) {
    setFriendRequestUserId(member.id);
    try {
      await friendsApi.createRequest({ targetUserId: member.id });
      setOutgoingFriendRequestUserIds(current =>
        current.includes(member.id) ? current : [...current, member.id],
      );
    } finally {
      setFriendRequestUserId(null);
    }
  }

  function handleViewMemberProfile(member) {
    navigate(`/users/${member.id}`);
  }

  async function refreshAfterModeration() {
    await Promise.all([
      loadRoomData(),
      messageFeed.loadInitial(),
      workspace.refreshWorkspace(),
    ]);
  }

  async function handlePromote(member) {
    setModerationActionKey("promote");
    try {
      await adminApi.addAdmin(roomId, member.id);
      setSelectedMember(null);
      await refreshAfterModeration();
    } finally {
      setModerationActionKey("");
    }
  }

  async function handleDemote(member) {
    setModerationActionKey("demote");
    try {
      await adminApi.removeAdmin(roomId, member.id);
      setSelectedMember(null);
      await refreshAfterModeration();
    } finally {
      setModerationActionKey("");
    }
  }

  async function handleRemove(member) {
    setModerationActionKey("remove");
    try {
      await adminApi.removeMember(roomId, member.id);
      setSelectedMember(null);
      await refreshAfterModeration();
    } finally {
      setModerationActionKey("");
    }
  }

  async function handleBan(member, reason) {
    setModerationActionKey("ban");
    try {
      await adminApi.ban(roomId, { userId: member.id, reason });
      setSelectedMember(null);
      await refreshAfterModeration();
    } finally {
      setModerationActionKey("");
    }
  }

  async function handleUnban(ban) {
    setModerationActionKey(`unban:${ban.userId}`);
    try {
      await adminApi.unban(roomId, ban.userId);
      const result = await adminApi.listBans(roomId);
      setBans(result.bans);
    } finally {
      setModerationActionKey("");
    }
  }

  async function handleDeleteRoom() {
    setIsDeletingRoom(true);
    try {
      await adminApi.deleteRoom(roomId);
      await workspace.refreshWorkspace();
      navigate("/rooms");
    } finally {
      setIsDeletingRoom(false);
    }
  }

  async function handleLeaveRoom() {
    setIsLeavingRoom(true);
    try {
      await roomsApi.leave(roomId);
      await workspace.refreshWorkspace();
      navigate("/rooms");
    } finally {
      setIsLeavingRoom(false);
    }
  }

  async function handleSuggestGoalPlan() {
    if (!goalForm.title.trim()) {
      setGoalError("Add a title before asking for suggested steps.");
      return;
    }

    try {
      setGoalError("");
      setGoalActionKey("suggest");
      const result = await roomsApi.suggestGoal(roomId, goalForm.title.trim());
      setGoalForm(current => ({
        ...current,
        steps: result.steps,
        resources: result.resources ?? [],
      }));
      setGoalStatus(goalForm.mode === "discussion" ? "Suggested discussion agenda loaded." : "Suggested steps loaded.");
    } catch (error) {
      setGoalError(error.message);
    } finally {
      setGoalActionKey("");
    }
  }

  async function handleCreateGoal(event) {
    event.preventDefault();
    setGoalError("");
    setGoalStatus("");

    if (!goalForm.title.trim()) {
      setGoalError("Goal title is required.");
      return;
    }

    try {
      setGoalActionKey("create");
      const result = await roomsApi.createGoal(roomId, {
        title:
          goalForm.mode === "discussion"
            ? `${DISCUSSION_TOPIC_PREFIX}${goalForm.title.trim()}`
            : goalForm.title.trim(),
        description: goalForm.description,
        rewardXp: goalForm.mode === "discussion" ? 0 : undefined,
        steps: goalForm.steps,
        resourceLanguage: workspace.currentUser?.preferredLanguage || null,
        activateInChat: goalForm.mode === "discussion",
      });

      await loadRoomData();
      setGoalForm({ mode: "goal", title: "", description: "", steps: [], resources: [] });
      setGoalStatus(
        goalForm.mode === "discussion"
          ? "Discussion topic created and opened in chat."
          : "Room goal created.",
      );
      if (goalForm.mode === "discussion") {
        setActivePane("chat");
        setIsDiscussionVisible(true);
      }
    } catch (error) {
      setGoalError(error.message);
    } finally {
      setGoalActionKey("");
    }
  }

  async function handleToggleGoalStep(goal, step) {
    try {
      setGoalActionKey(`toggle:${step.id}`);
      const result = await roomsApi.toggleGoalStep(roomId, goal.id, step.id);
      setGoals(current =>
        current.map(item => (item.id === goal.id ? result.goal : item)),
      );
      await workspace.refreshWorkspace();
    } catch (error) {
      setGoalError(error.message);
    } finally {
      setGoalActionKey("");
    }
  }

  function handleStartEditingGoal(goal) {
    setGoalError("");
    setGoalStatus("");
    setEditingGoalId(goal.id);
    setEditingGoalDraft({
      title: goal.displayTitle,
      description: goal.description || "",
    });
  }

  function handleCancelEditingGoal() {
    setEditingGoalId(null);
    setEditingGoalDraft({ title: "", description: "" });
  }

  async function handleSaveGoalEdit(goal) {
    const trimmedTitle = editingGoalDraft.title.trim();
    if (trimmedTitle.length < 3) {
      setGoalError("Title must be at least 3 characters long.");
      return;
    }

    try {
      setGoalError("");
      setGoalActionKey(`save:${goal.id}`);
      await roomsApi.updateGoal(roomId, goal.id, {
        title:
          goal.entryType === "discussion"
            ? `${DISCUSSION_TOPIC_PREFIX}${trimmedTitle}`
            : trimmedTitle,
        description: editingGoalDraft.description,
      });
      await loadRoomData();
      setGoalStatus(goal.entryType === "discussion" ? "Topic updated." : "Goal updated.");
      handleCancelEditingGoal();
    } catch (error) {
      setGoalError(error.message);
    } finally {
      setGoalActionKey("");
    }
  }

  async function handleDeleteGoal(goal) {
    const confirmed = window.confirm(
      goal.entryType === "discussion"
        ? "Delete this discussion topic?"
        : "Delete this goal?",
    );

    if (!confirmed) {
      return;
    }

    try {
      setGoalError("");
      setGoalActionKey(`delete:${goal.id}`);
      await roomsApi.deleteGoal(roomId, goal.id);
      await loadRoomData();
      if (editingGoalId === goal.id) {
        handleCancelEditingGoal();
      }
      setGoalStatus(goal.entryType === "discussion" ? "Topic deleted." : "Goal deleted.");
    } catch (error) {
      setGoalError(error.message);
    } finally {
      setGoalActionKey("");
    }
  }

  async function handleActivateTopic(goal) {
    try {
      setGoalError("");
      setGoalActionKey(`activate:${goal.id}`);
      await roomsApi.activateGoalInChat(roomId, goal.id);
      await loadRoomData();
      setActivePane("chat");
      setIsDiscussionVisible(true);
      setGoalStatus("Discussion topic opened in chat.");
    } catch (error) {
      setGoalError(error.message);
    } finally {
      setGoalActionKey("");
    }
  }

  async function handleClearActiveTopic() {
    try {
      setGoalError("");
      setGoalActionKey("clear-active-topic");
      await roomsApi.clearActiveTopic(roomId);
      await loadRoomData();
      setGoalStatus("Discussion topic removed from chat.");
    } catch (error) {
      setGoalError(error.message);
    } finally {
      setGoalActionKey("");
    }
  }

  const subtitle = useMemo(() => {
    if (!room) {
      return "";
    }

    return `${room.visibility} ${room.category} room · ${members.length}/${room.maxMembers ?? "unlimited"} members · ${room.messageCount ?? 0} messages`;
  }, [members.length, room]);

  const boardEntries = useMemo(
    () => goals.map(parseBoardEntry),
    [goals],
  );

  const activeDiscussionTopic = useMemo(
    () =>
      boardEntries.find(
        entry => entry.entryType === "discussion" && entry.isActiveTopic,
      ) ?? null,
    [boardEntries],
  );

  const liveOnlineCount = useMemo(
    () => members.filter(member => member.status === "online").length,
    [members],
  );

  const typingText = useMemo(() => formatTypingText(typingUsers), [typingUsers]);
  const shouldShowInviteMatches =
    activePane === "people" &&
    normalizedInviteQuery.length > 0 &&
    inviteSearchCompletedQuery === normalizedInviteQuery &&
    inviteResults.length > 0;
  const shouldShowInviteNotFound =
    activePane === "people" &&
    normalizedInviteQuery.length > 0 &&
    !isSearchingInvite &&
    inviteSearchCompletedQuery === normalizedInviteQuery &&
    inviteResults.length === 0;

  const handleTypingStateChange = useCallback(
    isTyping => {
      socket?.emit("room:typing", { roomId, isTyping });
    },
    [roomId, socket],
  );

  const voiceRoster = useMemo(() => {
    return voiceParticipants.map(participant => {
      const member = members.find(item => item.id === participant.userId);
      return {
        ...participant,
        member,
        isCurrentUser: participant.userId === workspace.currentUser?.id,
      };
    });
  }, [members, voiceParticipants, workspace.currentUser?.id]);

  if (!room) {
    return <div className="screen-center">Loading room...</div>;
  }

  if (!room.isMember) {
    return (
      <EmptyState
        title="Join required"
        description="You need room access before opening the message history."
      />
    );
  }

  return (
    <div className="room-shell">
      <aside className="room-nav">
        <div className="panel-card room-nav__panel room-nav__panel--compact">
          <div className="stack compact-stack">
            <p className="eyebrow">Channel</p>
            <strong className="room-nav__title">{room.name}</strong>
            <div className="inline-actions wrap-actions room-nav__meta">
              <span className="stat-chip">{room.visibility}</span>
              <span className="stat-chip">{room.category}</span>
              <span className="stat-chip">{room.onlineCount} active</span>
              <span className="stat-chip">
                {room.memberCount}/{room.maxMembers ?? "unlimited"} members
              </span>
            </div>
            {room.description ? <small>{room.description}</small> : null}
          </div>
          <div className="stack">
            <button
              type="button"
              className={`room-nav-button ${activePane === "chat" && isDiscussionVisible ? "is-active" : ""}`}
              onClick={() => {
                setActivePane("chat");
                setIsDiscussionVisible(true);
              }}
            >
              <strong>Discussion</strong>
              <small>
                {activeDiscussionTopic
                  ? activeDiscussionTopic.displayTitle
                  : isDiscussionVisible
                    ? "Room messages"
                    : "Hidden right now"}
              </small>
            </button>
            <button
              type="button"
              className={`room-nav-button ${activePane === "goals" ? "is-active" : ""}`}
              onClick={() => setActivePane("goals")}
            >
              <strong>Goals</strong>
              <small>{boardEntries.length} goals and topics</small>
            </button>
            <button
              type="button"
              className={`room-nav-button ${activePane === "voice" ? "is-active" : ""}`}
              onClick={() => setActivePane("voice")}
            >
              <strong>Voice</strong>
              <small>{voiceParticipants.length} in the lounge</small>
            </button>
            <button
              type="button"
              className={`room-nav-button ${activePane === "people" ? "is-active" : ""}`}
              onClick={() => setActivePane("people")}
            >
              <strong>People</strong>
              <small>Members and roles</small>
            </button>
          </div>
        </div>
      </aside>

      <section className="chat-panel">
        <ChatHeader
          title={
            activePane === "chat"
              ? room.name
              : activePane === "people"
                ? `${room.name} people`
              : activePane === "goals"
                ? `${room.name} board`
                : `${room.name} voice`
          }
          subtitle={
            activePane === "people"
              ? "Members, roles, and private-room invitations"
              : activePane === "goals"
              ? "Shared goals, discussion topics, and mission progress"
              : activePane === "voice"
                ? "Join the room voice lounge and see who is active"
                : subtitle
          }
          activity={
            activePane === "chat" ? (
              <>
                <span className="chat-header__online-dot" aria-hidden="true" />
                <span>{liveOnlineCount} online now</span>
                {typingText ? (
                  <>
                    <span className="chat-header__separator" aria-hidden="true">
                      {" · "}
                    </span>
                    <span className="chat-header__typing">{typingText}</span>
                  </>
                ) : null}
              </>
            ) : null
          }
          extra={
            <>
              {activePane === "chat" ? (
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => setIsDiscussionVisible(current => !current)}
                >
                  {isDiscussionVisible ? "Hide chat" : "Open chat"}
                </button>
              ) : null}
              <>
                {canLeaveRoom ? (
                  <button
                    type="button"
                    className="ghost-button"
                    onClick={handleLeaveRoom}
                    disabled={isLeavingRoom}
                    aria-busy={isLeavingRoom}
                  >
                    {isLeavingRoom ? "Leaving..." : "Leave room"}
                  </button>
                ) : null}
                {canDeleteRoom ? (
                  <button
                    type="button"
                    className="ghost-button danger-text"
                    onClick={() => setShowDeleteRoomModal(true)}
                  >
                    Delete room
                  </button>
                ) : null}
              </>
            </>
          }
        />

        {activePane === "chat" ? (
          isDiscussionVisible ? (
            <>
              {activeDiscussionTopic ? (
                <div className="warning-banner room-topic-banner">
                  <div className="panel-card__header">
                    <div className="stack compact-stack">
                      <div className="inline-actions wrap-actions">
                        <span className="stat-chip">discussion topic</span>
                        <span className="quest-pill">{activeDiscussionTopic.status}</span>
                      </div>
                      <strong>{activeDiscussionTopic.displayTitle}</strong>
                      <p>
                        {activeDiscussionTopic.description ||
                          "This topic is currently opened in the main room chat."}
                      </p>
                    </div>
                    <div className="inline-actions wrap-actions">
                      <button
                        type="button"
                        className="ghost-button"
                        onClick={() => setActivePane("goals")}
                      >
                        Open board
                      </button>
                      <button
                        type="button"
                        className="ghost-button"
                        onClick={handleClearActiveTopic}
                        disabled={goalActionKey === "clear-active-topic"}
                        aria-busy={goalActionKey === "clear-active-topic"}
                      >
                        {goalActionKey === "clear-active-topic" ? "Removing..." : "Remove from chat"}
                      </button>
                    </div>
                  </div>
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
          canModerate={canModerate}
        />

            <MessageComposer
              onSend={handleSend}
              onTypingStateChange={handleTypingStateChange}
              replyTo={replyTo}
              onCancelReply={() => setReplyTo(null)}
              disabled={isSendingMessage}
              placeholder={
                activeDiscussionTopic
                  ? `Reply to ${activeDiscussionTopic.displayTitle}`
                  : `Write to ${room.name}`
              }
              submitLabel={isSendingMessage ? "Sending..." : "Send"}
              isSending={isSendingMessage}
              errorMessage={composerError}
            />
            </>
          ) : (
            <div className="message-list room-collapsed-view">
              <EmptyState
                title="Discussion hidden"
                description="Open the discussion whenever you want to read the room chat or send a new message."
                action={(
                  <button
                    type="button"
                    className="primary-button"
                    onClick={() => setIsDiscussionVisible(true)}
                  >
                    Open discussion
                  </button>
                )}
              />
            </div>
          )
        ) : activePane === "goals" ? (
          <div className="message-list room-goals-view">
            <div className="panel-card">
              <div className="panel-card__header">
                <h3>Goals and discussion topics</h3>
              </div>
              <form className="stack" onSubmit={handleCreateGoal}>
                <div className="inline-actions wrap-actions">
                  <button
                    type="button"
                    className={`ghost-button ${goalForm.mode === "goal" ? "is-selected" : ""}`}
                    onClick={() =>
                      setGoalForm(current => ({ ...current, mode: "goal", resources: [] }))
                    }
                  >
                    Goal
                  </button>
                  <button
                    type="button"
                    className={`ghost-button ${goalForm.mode === "discussion" ? "is-selected" : ""}`}
                    onClick={() =>
                      setGoalForm(current => ({ ...current, mode: "discussion", resources: [] }))
                    }
                  >
                    Discussion topic
                  </button>
                </div>
                <input
                  className="text-input"
                  placeholder={
                    goalForm.mode === "discussion"
                      ? "Name the topic people should discuss"
                      : "What should this room achieve next?"
                  }
                  value={goalForm.title}
                  onChange={event =>
                    setGoalForm(current => ({ ...current, title: event.target.value }))
                  }
                />
                <textarea
                  className="text-input"
                  rows={3}
                  placeholder={
                    goalForm.mode === "discussion"
                      ? "Set the angle, agenda, or questions for the discussion"
                      : "Describe the mission or outcome"
                  }
                  value={goalForm.description}
                  onChange={event =>
                    setGoalForm(current => ({ ...current, description: event.target.value }))
                  }
                />
                <div className="inline-actions wrap-actions">
                  <button
                    type="button"
                    className="ghost-button"
                    onClick={handleSuggestGoalPlan}
                    disabled={goalActionKey === "suggest"}
                    aria-busy={goalActionKey === "suggest"}
                  >
                    {goalActionKey === "suggest"
                      ? "Thinking..."
                      : goalForm.mode === "discussion"
                        ? "Suggest agenda"
                        : "Suggest steps"}
                  </button>
                  <button
                    type="submit"
                    className="primary-button"
                    disabled={goalActionKey === "create"}
                    aria-busy={goalActionKey === "create"}
                  >
                    {goalActionKey === "create"
                      ? "Creating..."
                      : goalForm.mode === "discussion"
                        ? "Create topic"
                        : "Create goal"}
                  </button>
                </div>
                {goalForm.steps.length ? (
                  <div className="stack">
                    {goalForm.steps.map((step, index) => (
                      <div key={`${step}-${index}`} className="info-box">
                        <strong>{goalForm.mode === "discussion" ? "Prompt" : `Step ${index + 1}`}</strong>
                        <p>{step}</p>
                      </div>
                    ))}
                  </div>
                ) : null}
                {goalForm.resources?.length ? (
                  <div className="resource-list">
                    {goalForm.resources.map(resource => (
                      <a
                        key={resource.url}
                        href={resource.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-link"
                      >
                        {resource.title}
                      </a>
                    ))}
                  </div>
                ) : null}
                {goalStatus ? <p className="success-text">{goalStatus}</p> : null}
                {goalError ? <p className="error-text">{goalError}</p> : null}
              </form>
            </div>

            <div className="stack">
              {boardEntries.map(goal => (
                <div key={goal.id} className="info-box">
                  <div className="panel-card__header">
                    <div className="stack compact-stack">
                      <strong>{goal.displayTitle}</strong>
                      <div className="inline-actions wrap-actions">
                        <span className="stat-chip">
                          {goal.entryType === "discussion" ? "discussion" : "goal"}
                        </span>
                        {goal.isActiveTopic ? <span className="stat-chip">live in chat</span> : null}
                        <span className={`quest-pill ${goal.status === "completed" ? "is-complete" : ""}`}>
                          {goal.status}
                        </span>
                      </div>
                    </div>
                    <div className="inline-actions wrap-actions room-goal-card__actions">
                      {goal.entryType === "discussion" ? (
                        <>
                          <button
                            type="button"
                            className="ghost-button ghost-button--xs"
                            onClick={() => {
                              if (goal.isActiveTopic) {
                                setActivePane("chat");
                                setIsDiscussionVisible(true);
                                return;
                              }

                              handleActivateTopic(goal);
                            }}
                            disabled={goalActionKey === `activate:${goal.id}`}
                            aria-busy={goalActionKey === `activate:${goal.id}`}
                          >
                            {goal.isActiveTopic
                              ? "Open chat"
                              : goalActionKey === `activate:${goal.id}`
                                ? "Opening..."
                                : "Open in chat"}
                          </button>
                          {goal.isActiveTopic ? (
                            <button
                              type="button"
                              className="ghost-button ghost-button--xs"
                              onClick={handleClearActiveTopic}
                              disabled={goalActionKey === "clear-active-topic"}
                              aria-busy={goalActionKey === "clear-active-topic"}
                            >
                              {goalActionKey === "clear-active-topic" ? "Removing..." : "Remove"}
                            </button>
                          ) : null}
                        </>
                      ) : null}
                      {(canModerate || goal.createdByUserId === workspace.currentUser?.id) ? (
                        <>
                          <button
                            type="button"
                            className="ghost-button ghost-button--xs"
                            onClick={() => handleStartEditingGoal(goal)}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="ghost-button ghost-button--xs danger-text"
                            onClick={() => handleDeleteGoal(goal)}
                            disabled={goalActionKey === `delete:${goal.id}`}
                            aria-busy={goalActionKey === `delete:${goal.id}`}
                          >
                            {goalActionKey === `delete:${goal.id}` ? "Deleting..." : "Delete"}
                          </button>
                        </>
                      ) : null}
                    </div>
                  </div>
                  {editingGoalId === goal.id ? (
                    <div className="stack room-goal-editor">
                      <input
                        className="text-input"
                        value={editingGoalDraft.title}
                        onChange={event =>
                          setEditingGoalDraft(current => ({
                            ...current,
                            title: event.target.value,
                          }))
                        }
                      />
                      <textarea
                        className="text-input"
                        rows={3}
                        value={editingGoalDraft.description}
                        onChange={event =>
                          setEditingGoalDraft(current => ({
                            ...current,
                            description: event.target.value,
                          }))
                        }
                      />
                      <div className="inline-actions wrap-actions">
                        <button
                          type="button"
                          className="primary-button"
                          onClick={() => handleSaveGoalEdit(goal)}
                          disabled={goalActionKey === `save:${goal.id}`}
                          aria-busy={goalActionKey === `save:${goal.id}`}
                        >
                          {goalActionKey === `save:${goal.id}` ? "Saving..." : "Save"}
                        </button>
                        <button
                          type="button"
                          className="ghost-button"
                          onClick={handleCancelEditingGoal}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p>{goal.description || "No extra description yet."}</p>
                  )}
                  {goal.entryType === "goal" ? (
                    <small>Reward: {goal.rewardXp} XP</small>
                  ) : (
                    <small>Open for everyone in the room to continue.</small>
                  )}
                  <div className="stack">
                    {goal.steps.map(step => (
                      <label key={step.id} className="toggle-chip">
                        <input
                          type="checkbox"
                          checked={step.isCompleted}
                          disabled={goalActionKey === `toggle:${step.id}`}
                          onChange={() => handleToggleGoalStep(goal, step)}
                        />
                        <span>
                          {step.title}
                          {goalActionKey === `toggle:${step.id}` ? " (saving...)" : ""}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
              {!boardEntries.length ? (
                <EmptyState
                  title="No goals or topics yet"
                  description="Create the first room mission or discussion topic."
                />
              ) : null}
            </div>
          </div>
        ) : activePane === "people" ? (
          <div className="message-list room-people-view">
            <div className="panel-card room-people-panel">
              <div className="panel-card__header">
                <h3>People and room access</h3>
                <div className="inline-actions wrap-actions">
                  <span className="stat-chip">{members.length} members</span>
                  <span className="stat-chip">{room.category}</span>
                  <span className="stat-chip">Lv {room.levelRequirement}+</span>
                  {room.voiceEnabled ? <span className="stat-chip">Voice</span> : null}
                  {room.videoEnabled ? <span className="stat-chip">Video</span> : null}
                </div>
              </div>

              {canInvite ? (
                <div className="stack room-people-panel__invite">
                  <div className="stack compact-stack">
                    <strong>Invite people</strong>
                    <small>Search by immutable username and invite members into this private room.</small>
                  </div>
                  <div className="inline-actions wrap-actions room-people-panel__invite-controls">
                    <input
                      className="text-input room-people-panel__invite-input"
                      placeholder="Search by @username"
                      value={inviteQuery}
                      onChange={event => setInviteQuery(event.target.value)}
                    />
                    <button
                      type="button"
                      className="ghost-button"
                      onClick={handleSearchInvite}
                      disabled={isSearchingInvite || !normalizedInviteQuery}
                      aria-busy={isSearchingInvite}
                    >
                      {isSearchingInvite ? "Searching..." : "Search"}
                    </button>
                  </div>

                  {normalizedInviteQuery ? (
                    <div className="invite-search-results">
                      {shouldShowInviteMatches ? (
                        <>
                          <p className="invite-search-caption">Similar tags for @{normalizedInviteQuery}</p>
                          {inviteResults.map(result => {
                            const isMember = members.some(member => member.id === result.id);

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
                                    onClick={() => handleInvite(result.id)}
                                    disabled={isMember || invitingUserId === result.id}
                                    aria-busy={invitingUserId === result.id}
                                  >
                                    {isMember
                                      ? "Already here"
                                      : invitingUserId === result.id
                                        ? "Inviting..."
                                        : "Invite"}
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </>
                      ) : null}

                      {shouldShowInviteNotFound ? (
                        <p className="invite-search-feedback">No users found for this tag.</p>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ) : null}

              <MemberList
                members={members}
                canModerate={canModerate}
                onManageMember={setSelectedMember}
                onOpenBans={handleLoadBans}
                currentUserId={workspace.currentUser?.id}
                onRequestFriend={handleRequestFriend}
                onViewProfile={handleViewMemberProfile}
                pendingFriendRequestUserId={friendRequestUserId}
                outgoingFriendRequestUserIds={outgoingFriendRequestUserIds}
                friendUserIds={friendUserIds}
                isOpeningBans={isLoadingBans}
              />
            </div>
          </div>
        ) : (
          <div className="message-list room-voice-view">
            <div className="panel-card room-voice-panel">
              <div className="panel-card__header">
                <h3>Voice lounge</h3>
                <div className="inline-actions wrap-actions">
                  <span className="stat-chip">{voiceRoster.length} joined</span>
                  {room.videoEnabled ? <span className="stat-chip">camera allowed</span> : null}
                </div>
              </div>

              <div className="stack">
                <p className="room-voice-panel__copy">
                  Join the room lounge when you want to talk live, keep your mic muted, or use camera-ready rooms.
                </p>

                <div className="inline-actions wrap-actions">
                  {!voiceSession.joined ? (
                    <>
                      <button
                        type="button"
                        className="primary-button"
                        onClick={() => handleJoinVoice(false)}
                        disabled={isJoiningVoice}
                        aria-busy={isJoiningVoice}
                      >
                        {isJoiningVoice ? "Joining..." : "Join voice"}
                      </button>
                      {room.videoEnabled ? (
                        <button
                          type="button"
                          className="ghost-button"
                          onClick={() => handleJoinVoice(true)}
                          disabled={isJoiningVoice}
                          aria-busy={isJoiningVoice}
                        >
                          Join with camera
                        </button>
                      ) : null}
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        className="ghost-button"
                        onClick={handleToggleMute}
                      >
                        {voiceSession.muted ? "Turn mic on" : "Mute mic"}
                      </button>
                      <button
                        type="button"
                        className="ghost-button"
                        onClick={handleToggleScreenShare}
                      >
                        {voiceSession.screenSharing ? "Stop sharing" : "Share screen"}
                      </button>
                      {room.videoEnabled ? (
                        <button
                          type="button"
                          className="ghost-button"
                          onClick={handleToggleCamera}
                        >
                          {voiceSession.cameraEnabled ? "Camera off" : "Camera on"}
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="ghost-button danger-text"
                        onClick={handleLeaveVoice}
                      >
                        Leave voice
                      </button>
                    </>
                  )}
                </div>

                {voiceStatus ? <p className="success-text">{voiceStatus}</p> : null}
                {voiceError ? <p className="error-text">{voiceError}</p> : null}

                {voiceSession.joined ? (
                  <div
                    className={`room-voice-preview ${voiceSession.speaking ? "is-speaking" : ""} ${voiceSession.muted ? "is-muted" : ""} ${voiceSession.screenSharing ? "is-sharing-screen" : ""}`}
                  >
                    <div className="room-voice-preview__header">
                      <strong>You</strong>
                      <div className="inline-actions wrap-actions">
                        <VoiceMicBadge muted={voiceSession.muted} speaking={voiceSession.speaking} />
                        {voiceSession.cameraEnabled ? <span className="stat-chip">camera on</span> : null}
                        {voiceSession.screenSharing ? <span className="stat-chip">screen live</span> : null}
                      </div>
                    </div>
                    <div className="room-voice-preview__body">
                      {voiceSession.screenSharing || voiceSession.cameraEnabled ? (
                        <video
                          ref={localVoicePreviewRef}
                          autoPlay
                          muted
                          playsInline
                          className="room-voice-preview__video"
                        />
                      ) : (
                        <div className="room-voice-preview__placeholder">
                          <AvatarBadge user={workspace.currentUser} size="lg" />
                          <p>
                            {voiceSession.screenSharing
                              ? "Your screen is being shared"
                              : voiceSession.muted
                              ? "Microphone is muted"
                              : voiceSession.speaking
                                ? "Voice detected right now"
                                : "Microphone is active"}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                ) : null}

                <div className="room-voice-audio-layer" aria-hidden="true">
                  {remoteVoiceStreams.map(remoteStream => (
                    <audio
                      key={remoteStream.socketId}
                      autoPlay
                      playsInline
                      ref={element => {
                        if (element && element.srcObject !== remoteStream.stream) {
                          element.srcObject = remoteStream.stream;
                        }
                      }}
                    />
                  ))}
                </div>
              </div>
            </div>

            <div className="catalog-grid room-voice-grid">
              {voiceRoster.map(participant => (
                <div
                  key={participant.socketId}
                  className={`catalog-card room-voice-card ${participant.isCurrentUser ? "is-current-user" : ""} ${participant.speaking ? "is-speaking" : ""} ${participant.muted ? "is-muted" : ""} ${participant.screenSharing ? "is-sharing-screen" : ""}`}
                >
                  <div className="room-voice-card__identity">
                    <AvatarBadge user={participant.member ?? { username: "voice", level: 1 }} />
                    <div className="stack compact-stack">
                      <strong>
                        {participant.member?.displayName || participant.member?.username || "Room member"}
                      </strong>
                      <small>@{participant.member?.username || "member"}</small>
                    </div>
                  </div>
                  <div className="inline-actions wrap-actions">
                    <VoiceMicBadge muted={participant.muted} speaking={participant.speaking} />
                    {participant.cameraEnabled ? <span className="stat-chip">camera on</span> : null}
                    {participant.screenSharing ? <span className="stat-chip">sharing screen</span> : null}
                    {participant.isCurrentUser ? <span className="stat-chip">you</span> : null}
                  </div>
                </div>
              ))}
              {!voiceRoster.length ? (
                <div className="panel-card room-voice-empty">
                  <strong>No one is in voice yet</strong>
                  <p>Join the lounge when you want to start talking live.</p>
                </div>
              ) : null}
            </div>
          </div>
        )}
      </section>

      {selectedMember ? (
        <MemberAdminModal
          member={selectedMember}
          room={room}
          onClose={() => setSelectedMember(null)}
          onPromote={handlePromote}
          onDemote={handleDemote}
          onRemove={handleRemove}
          onBan={handleBan}
          busyActionKey={moderationActionKey}
        />
      ) : null}

      {showBansModal ? (
        <BansModal
          bans={bans}
          onClose={() => setShowBansModal(false)}
          onUnban={handleUnban}
          busyActionKey={moderationActionKey}
        />
      ) : null}

      {showDeleteRoomModal ? (
        <ConfirmDeleteRoomModal
          roomName={room.name}
          onClose={() => setShowDeleteRoomModal(false)}
          onConfirm={handleDeleteRoom}
          isDeleting={isDeletingRoom}
        />
      ) : null}

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
