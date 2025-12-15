// Database utility functions

import type { IdeaRow, Idea } from './types';

/**
 * Parse mini_ideas JSON string from database row
 */
export function parseMiniIdeas(row: IdeaRow): string[] {
  try {
    if (typeof row.mini_idea === 'string' && row.mini_idea.startsWith('[')) {
      return JSON.parse(row.mini_idea);
    }
    return [];
  } catch {
    return [];
  }
}

/**
 * Convert database row to Idea object
 */
export function rowToIdea(row: IdeaRow): Idea & { id: number } {
  return {
    id: row.id,
    date: row.date,
    ph_name: row.ph_name,
    ph_tagline: row.ph_tagline,
    ph_description: row.ph_tagline, // ph_tagline stores the full description
    ph_url: row.ph_url,
    ph_upvotes: row.ph_upvotes,
    ph_image: row.ph_image || undefined,
    mini_ideas: parseMiniIdeas(row),
  };
}

