-- Migration: Add title_summaries column to ideas table
-- This column stores a JSON array of title summaries (max 6 words each) for each mini_idea

ALTER TABLE ideas ADD COLUMN title_summaries TEXT;

-- Note: For existing rows, title_summaries will be NULL
-- The application will generate title summaries for new ideas going forward
