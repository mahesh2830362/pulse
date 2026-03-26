-- Phase 3: Source management and monitoring tables
-- Run this in Supabase SQL Editor

-- Add feed_url column to sources table (if not exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sources' AND column_name = 'feed_url'
  ) THEN
    ALTER TABLE sources ADD COLUMN feed_url text;
  END IF;
END $$;

-- Add summary column to items table (for AI summaries)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'items' AND column_name = 'summary'
  ) THEN
    ALTER TABLE items ADD COLUMN summary text;
  END IF;
END $$;

-- Create feed_states table for tracking polling state
CREATE TABLE IF NOT EXISTS feed_states (
  source_id uuid PRIMARY KEY REFERENCES sources(id) ON DELETE CASCADE,
  last_checked_at timestamptz,
  last_content_hash text,
  etag text,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS on feed_states
ALTER TABLE feed_states ENABLE ROW LEVEL SECURITY;

-- Feed states policy: users can access feed states for their own sources
CREATE POLICY IF NOT EXISTS "Users can view their source feed states"
  ON feed_states FOR SELECT
  USING (
    source_id IN (
      SELECT id FROM sources WHERE user_id = auth.uid()
    )
  );

CREATE POLICY IF NOT EXISTS "Users can insert feed states for their sources"
  ON feed_states FOR INSERT
  WITH CHECK (
    source_id IN (
      SELECT id FROM sources WHERE user_id = auth.uid()
    )
  );

CREATE POLICY IF NOT EXISTS "Users can update feed states for their sources"
  ON feed_states FOR UPDATE
  USING (
    source_id IN (
      SELECT id FROM sources WHERE user_id = auth.uid()
    )
  );

CREATE POLICY IF NOT EXISTS "Users can delete feed states for their sources"
  ON feed_states FOR DELETE
  USING (
    source_id IN (
      SELECT id FROM sources WHERE user_id = auth.uid()
    )
  );

-- Index for efficient polling queries
CREATE INDEX IF NOT EXISTS idx_sources_active_interval
  ON sources(is_active, check_interval_minutes)
  WHERE is_active = true AND check_interval_minutes > 0;

CREATE INDEX IF NOT EXISTS idx_feed_states_last_checked
  ON feed_states(last_checked_at);
