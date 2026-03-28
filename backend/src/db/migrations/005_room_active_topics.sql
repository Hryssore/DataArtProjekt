ALTER TABLE rooms
ADD COLUMN IF NOT EXISTS active_topic_goal_id UUID REFERENCES room_goals(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS rooms_active_topic_goal_idx ON rooms (active_topic_goal_id);
