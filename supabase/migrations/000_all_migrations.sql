-- ============================================
-- PULSE: Complete Database Schema
-- Run this entire file in Supabase SQL Editor
-- ============================================

-- ==========================================
-- 001: Core Tables
-- ==========================================

CREATE TABLE IF NOT EXISTS sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  url text NOT NULL,
  feed_url text,
  type text NOT NULL DEFAULT 'generic',
  name text NOT NULL,
  favicon text,
  check_interval_minutes integer NOT NULL DEFAULT 30,
  is_high_priority boolean DEFAULT false,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, url)
);

CREATE TABLE IF NOT EXISTS items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid REFERENCES sources(id) ON DELETE SET NULL,
  url text NOT NULL,
  title text NOT NULL,
  content_snippet text,
  author text,
  published_at timestamptz,
  image_url text,
  content_hash text NOT NULL,
  raw_metadata jsonb DEFAULT '{}',
  summary text,
  created_at timestamptz DEFAULT now(),
  UNIQUE(content_hash)
);

CREATE TABLE IF NOT EXISTS user_feed_items (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  is_read boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  PRIMARY KEY (user_id, item_id)
);

-- Core indexes
CREATE INDEX IF NOT EXISTS idx_sources_user_id ON sources(user_id);
CREATE INDEX IF NOT EXISTS idx_sources_type ON sources(type);
CREATE INDEX IF NOT EXISTS idx_items_content_hash ON items(content_hash);
CREATE INDEX IF NOT EXISTS idx_items_source_id ON items(source_id);
CREATE INDEX IF NOT EXISTS idx_items_created_at ON items(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_feed_items_user ON user_feed_items(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_feed_items_unread ON user_feed_items(user_id, is_read) WHERE is_read = false;

-- RLS for core tables
ALTER TABLE sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE items ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_feed_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own sources"
  ON sources FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Users can create their own sources"
  ON sources FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can update their own sources"
  ON sources FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "Users can delete their own sources"
  ON sources FOR DELETE USING (user_id = auth.uid());

CREATE POLICY "Anyone can view items"
  ON items FOR SELECT USING (true);
CREATE POLICY "Authenticated users can insert items"
  ON items FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can update items"
  ON items FOR UPDATE USING (auth.uid() IS NOT NULL);

CREATE POLICY "Users can view their own feed items"
  ON user_feed_items FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Users can add to their own feed"
  ON user_feed_items FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can update their own feed items"
  ON user_feed_items FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "Users can remove from their own feed"
  ON user_feed_items FOR DELETE USING (user_id = auth.uid());

-- ==========================================
-- 002: Feed States (for RSS polling)
-- ==========================================

CREATE TABLE IF NOT EXISTS feed_states (
  source_id uuid PRIMARY KEY REFERENCES sources(id) ON DELETE CASCADE,
  last_checked_at timestamptz,
  last_content_hash text,
  etag text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE feed_states ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their source feed states"
  ON feed_states FOR SELECT
  USING (source_id IN (SELECT id FROM sources WHERE user_id = auth.uid()));
CREATE POLICY "Users can insert feed states for their sources"
  ON feed_states FOR INSERT
  WITH CHECK (source_id IN (SELECT id FROM sources WHERE user_id = auth.uid()));
CREATE POLICY "Users can update feed states for their sources"
  ON feed_states FOR UPDATE
  USING (source_id IN (SELECT id FROM sources WHERE user_id = auth.uid()));
CREATE POLICY "Users can delete feed states for their sources"
  ON feed_states FOR DELETE
  USING (source_id IN (SELECT id FROM sources WHERE user_id = auth.uid()));

CREATE INDEX IF NOT EXISTS idx_sources_active_interval
  ON sources(is_active, check_interval_minutes)
  WHERE is_active = true AND check_interval_minutes > 0;
CREATE INDEX IF NOT EXISTS idx_feed_states_last_checked
  ON feed_states(last_checked_at);

-- ==========================================
-- 003: Bookmarks & Tags
-- ==========================================

CREATE TABLE IF NOT EXISTS bookmarks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, item_id)
);

CREATE TABLE IF NOT EXISTS tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  color text NOT NULL DEFAULT '#0071e3',
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, name)
);

CREATE TABLE IF NOT EXISTS bookmark_tags (
  bookmark_id uuid NOT NULL REFERENCES bookmarks(id) ON DELETE CASCADE,
  tag_id uuid NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (bookmark_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_bookmarks_user_id ON bookmarks(user_id);
CREATE INDEX IF NOT EXISTS idx_bookmarks_item_id ON bookmarks(item_id);
CREATE INDEX IF NOT EXISTS idx_tags_user_id ON tags(user_id);
CREATE INDEX IF NOT EXISTS idx_bookmark_tags_bookmark ON bookmark_tags(bookmark_id);
CREATE INDEX IF NOT EXISTS idx_bookmark_tags_tag ON bookmark_tags(tag_id);

ALTER TABLE bookmarks ENABLE ROW LEVEL SECURITY;
ALTER TABLE tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookmark_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own bookmarks"
  ON bookmarks FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Users can create their own bookmarks"
  ON bookmarks FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can update their own bookmarks"
  ON bookmarks FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "Users can delete their own bookmarks"
  ON bookmarks FOR DELETE USING (user_id = auth.uid());

CREATE POLICY "Users can view their own tags"
  ON tags FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Users can create their own tags"
  ON tags FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can update their own tags"
  ON tags FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "Users can delete their own tags"
  ON tags FOR DELETE USING (user_id = auth.uid());

CREATE POLICY "Users can view their bookmark tags"
  ON bookmark_tags FOR SELECT
  USING (bookmark_id IN (SELECT id FROM bookmarks WHERE user_id = auth.uid()));
CREATE POLICY "Users can add tags to their bookmarks"
  ON bookmark_tags FOR INSERT
  WITH CHECK (bookmark_id IN (SELECT id FROM bookmarks WHERE user_id = auth.uid()));
CREATE POLICY "Users can remove tags from their bookmarks"
  ON bookmark_tags FOR DELETE
  USING (bookmark_id IN (SELECT id FROM bookmarks WHERE user_id = auth.uid()));

-- ==========================================
-- 004: Notifications
-- ==========================================

CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  body text NOT NULL,
  url text,
  is_read boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

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

CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON notifications(user_id, is_read) WHERE is_read = false;
CREATE INDEX IF NOT EXISTS idx_notifications_user_created
  ON notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_push_subs_user
  ON push_subscriptions(user_id);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own notifications"
  ON notifications FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Users can insert their own notifications"
  ON notifications FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can update their own notifications"
  ON notifications FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "Users can delete their own notifications"
  ON notifications FOR DELETE USING (user_id = auth.uid());

CREATE POLICY "Users can view their own push subscriptions"
  ON push_subscriptions FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Users can create their own push subscriptions"
  ON push_subscriptions FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can update their own push subscriptions"
  ON push_subscriptions FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "Users can delete their own push subscriptions"
  ON push_subscriptions FOR DELETE USING (user_id = auth.uid());
