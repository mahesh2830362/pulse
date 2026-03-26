-- Phase 4: Bookmarks and Tags
-- Run this in Supabase SQL Editor

-- Create bookmarks table
CREATE TABLE IF NOT EXISTS bookmarks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, item_id)
);

-- Create tags table
CREATE TABLE IF NOT EXISTS tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  color text NOT NULL DEFAULT '#0071e3',
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, name)
);

-- Create bookmark_tags join table
CREATE TABLE IF NOT EXISTS bookmark_tags (
  bookmark_id uuid NOT NULL REFERENCES bookmarks(id) ON DELETE CASCADE,
  tag_id uuid NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (bookmark_id, tag_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_bookmarks_user_id ON bookmarks(user_id);
CREATE INDEX IF NOT EXISTS idx_bookmarks_item_id ON bookmarks(item_id);
CREATE INDEX IF NOT EXISTS idx_tags_user_id ON tags(user_id);
CREATE INDEX IF NOT EXISTS idx_bookmark_tags_bookmark ON bookmark_tags(bookmark_id);
CREATE INDEX IF NOT EXISTS idx_bookmark_tags_tag ON bookmark_tags(tag_id);

-- Enable RLS
ALTER TABLE bookmarks ENABLE ROW LEVEL SECURITY;
ALTER TABLE tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookmark_tags ENABLE ROW LEVEL SECURITY;

-- Bookmarks policies
CREATE POLICY "Users can view their own bookmarks"
  ON bookmarks FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can create their own bookmarks"
  ON bookmarks FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own bookmarks"
  ON bookmarks FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "Users can delete their own bookmarks"
  ON bookmarks FOR DELETE USING (user_id = auth.uid());

-- Tags policies
CREATE POLICY "Users can view their own tags"
  ON tags FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can create their own tags"
  ON tags FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own tags"
  ON tags FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "Users can delete their own tags"
  ON tags FOR DELETE USING (user_id = auth.uid());

-- Bookmark tags policies (access if user owns the bookmark)
CREATE POLICY "Users can view their bookmark tags"
  ON bookmark_tags FOR SELECT
  USING (
    bookmark_id IN (SELECT id FROM bookmarks WHERE user_id = auth.uid())
  );

CREATE POLICY "Users can add tags to their bookmarks"
  ON bookmark_tags FOR INSERT
  WITH CHECK (
    bookmark_id IN (SELECT id FROM bookmarks WHERE user_id = auth.uid())
  );

CREATE POLICY "Users can remove tags from their bookmarks"
  ON bookmark_tags FOR DELETE
  USING (
    bookmark_id IN (SELECT id FROM bookmarks WHERE user_id = auth.uid())
  );
