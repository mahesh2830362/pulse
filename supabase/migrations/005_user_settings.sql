-- User settings table for API keys and preferences
-- Run this in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS user_settings (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  ai_provider text DEFAULT 'claude',
  ai_api_key text,
  ai_model text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own settings"
  ON user_settings FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own settings"
  ON user_settings FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own settings"
  ON user_settings FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "Users can delete their own settings"
  ON user_settings FOR DELETE USING (user_id = auth.uid());
