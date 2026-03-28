ALTER TYPE shop_item_type_enum ADD VALUE IF NOT EXISTS 'background';

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS profile_background_key TEXT NOT NULL DEFAULT 'bg-aurora';
