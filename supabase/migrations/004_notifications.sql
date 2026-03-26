-- Phase 6: Notifications
-- Run this in Supabase SQL Editor

-- In-app notifications
CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  body text NOT NULL,
  url text,
  is_read boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- Push subscriptions (Web Push / VAPID)
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint text NOT NULL,
  p256dh text NOT NULL,
  auth text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, endpoint)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON notifications(user_id, is_read)
  WHERE is_read = false;

CREATE INDEX IF NOT EXISTS idx_notifications_user_created
  ON notifications(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_push_subs_user
  ON push_subscriptions(user_id);

-- Enable RLS
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Notifications policies
CREATE POLICY "Users can view their own notifications"
  ON notifications FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own notifications"
  ON notifications FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own notifications"
  ON notifications FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "Users can delete their own notifications"
  ON notifications FOR DELETE USING (user_id = auth.uid());

-- Push subscriptions policies
CREATE POLICY "Users can view their own push subscriptions"
  ON push_subscriptions FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can create their own push subscriptions"
  ON push_subscriptions FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own push subscriptions"
  ON push_subscriptions FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "Users can delete their own push subscriptions"
  ON push_subscriptions FOR DELETE USING (user_id = auth.uid());
