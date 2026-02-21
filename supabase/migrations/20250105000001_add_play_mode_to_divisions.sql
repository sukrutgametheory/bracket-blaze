-- Add play_mode column to divisions for singles/doubles support
ALTER TABLE bracket_blaze_divisions
ADD COLUMN play_mode TEXT NOT NULL DEFAULT 'singles'
CHECK (play_mode IN ('singles', 'doubles'));
