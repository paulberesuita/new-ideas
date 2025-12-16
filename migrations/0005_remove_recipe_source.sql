-- Migration: Remove source column from recipes table
-- Sources are now separate from recipes - recipes are just "generation styles"
-- that can apply to any source (Product Hunt, URL, prompt, image, etc.)

-- SQLite doesn't support DROP COLUMN directly, so we need to recreate the table
-- However, for simplicity we'll just leave the column but stop using it
-- The column will be ignored by the application

-- Note: If you want to fully remove the column, you would need to:
-- 1. Create a new table without the source column
-- 2. Copy data from old table to new table
-- 3. Drop old table
-- 4. Rename new table

-- For now, we just update any source values to NULL to indicate they're not used
UPDATE recipes SET source = NULL;
