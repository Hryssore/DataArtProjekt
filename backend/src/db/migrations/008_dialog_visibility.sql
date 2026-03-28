ALTER TABLE personal_dialogs
  ADD COLUMN IF NOT EXISTS hidden_for_low_user_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS hidden_for_high_user_at TIMESTAMPTZ;
