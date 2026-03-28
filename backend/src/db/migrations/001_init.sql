CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'room_visibility_enum') THEN
    CREATE TYPE room_visibility_enum AS ENUM ('public', 'private');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'friend_request_status_enum') THEN
    CREATE TYPE friend_request_status_enum AS ENUM ('pending', 'accepted', 'rejected', 'cancelled');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'invitation_status_enum') THEN
    CREATE TYPE invitation_status_enum AS ENUM ('pending', 'accepted', 'revoked', 'expired');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'presence_status_enum') THEN
    CREATE TYPE presence_status_enum AS ENUM ('online', 'afk', 'offline');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email CITEXT NOT NULL UNIQUE,
  username CITEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_token_hash TEXT NOT NULL UNIQUE,
  ip INET,
  user_agent TEXT,
  browser TEXT,
  device_type TEXT,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS friend_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  receiver_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message TEXT,
  status friend_request_status_enum NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  responded_at TIMESTAMPTZ,
  CHECK (sender_id <> receiver_id),
  UNIQUE (sender_id, receiver_id)
);

CREATE TABLE IF NOT EXISTS friendships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_low_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_high_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (user_low_id <> user_high_id),
  UNIQUE (user_low_id, user_high_id)
);

CREATE TABLE IF NOT EXISTS user_bans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (source_user_id <> target_user_id),
  UNIQUE (source_user_id, target_user_id)
);

CREATE TABLE IF NOT EXISTS rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name CITEXT NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  visibility room_visibility_enum NOT NULL DEFAULT 'public',
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS room_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (room_id, user_id)
);

CREATE TABLE IF NOT EXISTS room_admins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  granted_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (room_id, user_id)
);

CREATE TABLE IF NOT EXISTS room_bans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  banned_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (room_id, user_id)
);

CREATE TABLE IF NOT EXISTS room_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  invited_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  invited_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  status invitation_status_enum NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  responded_at TIMESTAMPTZ,
  UNIQUE (room_id, invited_user_id)
);

CREATE TABLE IF NOT EXISTS personal_dialogs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_low_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_high_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  is_frozen BOOLEAN NOT NULL DEFAULT FALSE,
  frozen_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (user_low_id <> user_high_id),
  UNIQUE (user_low_id, user_high_id)
);

CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID REFERENCES rooms(id) ON DELETE CASCADE,
  dialog_id UUID REFERENCES personal_dialogs(id) ON DELETE CASCADE,
  sender_id UUID REFERENCES users(id) ON DELETE SET NULL,
  sender_username_snapshot TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  reply_to_message_id UUID REFERENCES messages(id) ON DELETE SET NULL,
  edited_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (((room_id IS NOT NULL)::INT + (dialog_id IS NOT NULL)::INT) = 1),
  CHECK (octet_length(body) <= 3072)
);

CREATE TABLE IF NOT EXISTS attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  stored_name TEXT NOT NULL UNIQUE,
  original_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 20971520),
  is_image BOOLEAN NOT NULL DEFAULT FALSE,
  storage_path TEXT NOT NULL,
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS message_reads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  read_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (message_id, user_id)
);

CREATE TABLE IF NOT EXISTS conversation_reads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  room_id UUID REFERENCES rooms(id) ON DELETE CASCADE,
  dialog_id UUID REFERENCES personal_dialogs(id) ON DELETE CASCADE,
  last_read_message_id UUID REFERENCES messages(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (((room_id IS NOT NULL)::INT + (dialog_id IS NOT NULL)::INT) = 1)
);

CREATE TABLE IF NOT EXISTS presence_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  socket_id TEXT NOT NULL UNIQUE,
  tab_id TEXT NOT NULL,
  last_heartbeat_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_activity_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS presence_states (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  status presence_status_enum NOT NULL DEFAULT 'offline',
  last_online_at TIMESTAMPTZ,
  last_activity_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS conversation_reads_unique_room
  ON conversation_reads (user_id, room_id)
  WHERE room_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS conversation_reads_unique_dialog
  ON conversation_reads (user_id, dialog_id)
  WHERE dialog_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions (user_id, expires_at DESC);
CREATE INDEX IF NOT EXISTS friend_requests_receiver_status_idx ON friend_requests (receiver_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS friendships_user_low_idx ON friendships (user_low_id);
CREATE INDEX IF NOT EXISTS friendships_user_high_idx ON friendships (user_high_id);
CREATE INDEX IF NOT EXISTS user_bans_source_idx ON user_bans (source_user_id);
CREATE INDEX IF NOT EXISTS rooms_visibility_name_idx ON rooms (visibility, name);
CREATE INDEX IF NOT EXISTS room_members_room_idx ON room_members (room_id, joined_at);
CREATE INDEX IF NOT EXISTS room_members_user_idx ON room_members (user_id);
CREATE INDEX IF NOT EXISTS room_bans_room_idx ON room_bans (room_id);
CREATE INDEX IF NOT EXISTS room_invitations_user_idx ON room_invitations (invited_user_id, status);
CREATE INDEX IF NOT EXISTS messages_room_created_idx ON messages (room_id, created_at DESC) WHERE room_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS messages_dialog_created_idx ON messages (dialog_id, created_at DESC) WHERE dialog_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS messages_reply_idx ON messages (reply_to_message_id);
CREATE INDEX IF NOT EXISTS attachments_message_idx ON attachments (message_id);
CREATE INDEX IF NOT EXISTS message_reads_user_idx ON message_reads (user_id, read_at DESC);
CREATE INDEX IF NOT EXISTS presence_connections_user_idx ON presence_connections (user_id, last_heartbeat_at DESC);
