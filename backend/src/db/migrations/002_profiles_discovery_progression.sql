DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'room_category_enum') THEN
    CREATE TYPE room_category_enum AS ENUM ('general', 'study', 'gaming', 'hangout');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'shop_item_type_enum') THEN
    CREATE TYPE shop_item_type_enum AS ENUM ('avatar', 'decoration', 'badge');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'room_goal_status_enum') THEN
    CREATE TYPE room_goal_status_enum AS ENUM ('open', 'completed');
  END IF;
END $$;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS display_name TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS bio TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS avatar_key TEXT NOT NULL DEFAULT 'ember-fox',
  ADD COLUMN IF NOT EXISTS decoration_key TEXT NOT NULL DEFAULT 'ring-sunrise',
  ADD COLUMN IF NOT EXISTS xp_points INTEGER NOT NULL DEFAULT 0 CHECK (xp_points >= 0),
  ADD COLUMN IF NOT EXISTS level INTEGER NOT NULL DEFAULT 1 CHECK (level >= 1),
  ADD COLUMN IF NOT EXISTS coins INTEGER NOT NULL DEFAULT 0 CHECK (coins >= 0),
  ADD COLUMN IF NOT EXISTS hearts_received INTEGER NOT NULL DEFAULT 0 CHECK (hearts_received >= 0),
  ADD COLUMN IF NOT EXISTS preferred_language TEXT,
  ADD COLUMN IF NOT EXISTS skill_focus TEXT,
  ADD COLUMN IF NOT EXISTS assessment_summary TEXT;

UPDATE users
SET display_name = username
WHERE display_name = '';

ALTER TABLE rooms
  ADD COLUMN IF NOT EXISTS category room_category_enum NOT NULL DEFAULT 'general',
  ADD COLUMN IF NOT EXISTS max_members INTEGER CHECK (max_members IS NULL OR max_members >= 2),
  ADD COLUMN IF NOT EXISTS voice_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS video_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS level_requirement INTEGER NOT NULL DEFAULT 1 CHECK (level_requirement >= 1),
  ADD COLUMN IF NOT EXISTS is_listed BOOLEAN NOT NULL DEFAULT TRUE;

CREATE TABLE IF NOT EXISTS shop_items (
  id TEXT PRIMARY KEY,
  item_type shop_item_type_enum NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  price_coins INTEGER NOT NULL CHECK (price_coins >= 0),
  unlock_level INTEGER NOT NULL DEFAULT 1 CHECK (unlock_level >= 1),
  asset_key TEXT NOT NULL UNIQUE,
  accent_color TEXT NOT NULL DEFAULT '#c35f2c',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_shop_items (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_id TEXT NOT NULL REFERENCES shop_items(id) ON DELETE CASCADE,
  purchased_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, item_id)
);

CREATE TABLE IF NOT EXISTS profile_hearts (
  sender_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (sender_user_id, target_user_id),
  CHECK (sender_user_id <> target_user_id)
);

CREATE TABLE IF NOT EXISTS user_xp_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL,
  source_id UUID,
  xp_delta INTEGER NOT NULL CHECK (xp_delta >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS room_goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  completed_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  reward_xp INTEGER NOT NULL DEFAULT 30 CHECK (reward_xp >= 0),
  status room_goal_status_enum NOT NULL DEFAULT 'open',
  resource_language TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS room_goal_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_id UUID NOT NULL REFERENCES room_goals(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  step_order INTEGER NOT NULL DEFAULT 0,
  is_completed BOOLEAN NOT NULL DEFAULT FALSE,
  completed_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO shop_items (id, item_type, title, description, price_coins, unlock_level, asset_key, accent_color)
VALUES
  ('avatar-ember-fox', 'avatar', 'Ember Fox', 'A warm fox avatar for classic chat profiles.', 0, 1, 'ember-fox', '#d36b3a'),
  ('avatar-midnight-cat', 'avatar', 'Midnight Cat', 'A dark cat avatar with calm energy.', 120, 2, 'midnight-cat', '#3f4b6b'),
  ('avatar-garden-owl', 'avatar', 'Garden Owl', 'A thoughtful owl for study rooms.', 180, 3, 'garden-owl', '#5a7c50'),
  ('avatar-sky-whale', 'avatar', 'Sky Whale', 'A playful avatar for social rooms.', 260, 4, 'sky-whale', '#4b7fa8'),
  ('decoration-ring-sunrise', 'decoration', 'Sunrise Ring', 'Soft bronze ring around the avatar.', 0, 1, 'ring-sunrise', '#c35f2c'),
  ('decoration-ring-aurora', 'decoration', 'Aurora Ring', 'A cool green profile decoration.', 140, 2, 'ring-aurora', '#4b8f76'),
  ('decoration-ring-royal', 'decoration', 'Royal Ring', 'High-contrast ring for higher levels.', 260, 4, 'ring-royal', '#8065b2'),
  ('badge-heartflare', 'badge', 'Heartflare', 'Shows extra appreciation on the profile card.', 220, 3, 'heartflare', '#d45454')
ON CONFLICT (id) DO NOTHING;

CREATE INDEX IF NOT EXISTS rooms_category_visibility_idx ON rooms (category, visibility, created_at DESC);
CREATE INDEX IF NOT EXISTS rooms_member_limit_idx ON rooms (max_members);
CREATE INDEX IF NOT EXISTS user_xp_events_user_created_idx ON user_xp_events (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS user_xp_events_created_idx ON user_xp_events (created_at DESC);
CREATE INDEX IF NOT EXISTS room_goals_room_status_idx ON room_goals (room_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS room_goal_steps_goal_order_idx ON room_goal_steps (goal_id, step_order);
