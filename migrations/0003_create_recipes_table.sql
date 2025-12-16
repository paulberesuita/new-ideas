-- Migration: Create recipes table
-- Recipes store reusable configurations for idea generation

CREATE TABLE IF NOT EXISTS recipes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT,
  prompt_style TEXT,
  exclusions TEXT,
  is_default INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Insert a default recipe based on current settings
INSERT INTO recipes (name, description, prompt_style, exclusions, is_default) VALUES (
  'Default',
  'Weekend project ideas for solo developers',
  'Focus on web apps or Chrome extensions that are buildable in a weekend. AI agent ideas are encouraged - automations, bots, or AI-powered tools.',
  '["embedding external content (TikTok, YouTube, etc.)", "video generation tools", "A/B testing tools"]',
  1
);
