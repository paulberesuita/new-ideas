-- Migration: Add source field to recipes table
-- Source indicates where the recipe is intended to be used (e.g., 'producthunt', 'url', 'prompt', 'image', or NULL for any)

ALTER TABLE recipes ADD COLUMN source TEXT;

-- Update the default recipe to be for Product Hunt
UPDATE recipes SET source = 'producthunt' WHERE is_default = 1;
