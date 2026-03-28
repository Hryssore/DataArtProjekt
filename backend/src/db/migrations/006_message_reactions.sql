CREATE TABLE IF NOT EXISTS message_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reaction TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (char_length(trim(reaction)) BETWEEN 1 AND 16),
  UNIQUE (message_id, user_id, reaction)
);

CREATE INDEX IF NOT EXISTS message_reactions_message_idx
  ON message_reactions (message_id, created_at DESC);

CREATE INDEX IF NOT EXISTS message_reactions_user_idx
  ON message_reactions (user_id, created_at DESC);
