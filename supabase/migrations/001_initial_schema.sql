-- Phase 1: Initial schema — core tables
-- Run this FIRST in Supabase SQL Editor

-- Sources table: websites, X profiles, YouTube channels being followed
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

-- Items table: individual pieces of content (articles, tweets, videos)
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

-- User feed items: links users to items with read state
CREATE TABLE IF NOT EXISTS user_feed_items (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  is_read boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  PRIMARY KEY (user_id, item_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_sources_user_id ON sources(user_id);
CREATE INDEX IF NOT EXISTS idx_sources_type ON sources(type);
CREATE INDEX IF NOT EXISTS idx_items_content_hash ON items(content_hash);
CREATE INDEX IF NOT EXISTS idx_items_source_id ON items(source_id);
CREATE INDEX IF NOT EXISTS idx_items_created_at ON items(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_feed_items_user ON user_feed_items(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_feed_items_unread ON user_feed_items(user_id, is_read) WHERE is_read = false;

-- Enable Row Level Security
ALTER TABLE sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE items ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_feed_items ENABLE ROW LEVEL SECURITY;

-- Sources policies: users can only access their own sources
CREATE POLICY "Users can view their own sources"
  ON sources FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can create their own sources"
  ON sources FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own sources"
  ON sources FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "Users can delete their own sources"
  ON sources FOR DELETE USING (user_id = auth.uid());

-- Items policies: anyone can read items (shared content), only system inserts
CREATE POLICY "Anyone can view items"
  ON items FOR SELECT USING (true);

CREATE POLICY "Authenticated users can insert items"
  ON items FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update items"
  ON items FOR UPDATE USING (auth.uid() IS NOT NULL);

-- User feed items policies
CREATE POLICY "Users can view their own feed items"
  ON user_feed_items FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can add to their own feed"
  ON user_feed_items FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own feed items"
  ON user_feed_items FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "Users can remove from their own feed"
  ON user_feed_items FOR DELETE USING (user_id = auth.uid());
