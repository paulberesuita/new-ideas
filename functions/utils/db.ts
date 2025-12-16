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
 * Parse title_summaries JSON string from database row
 */
export function parseTitleSummaries(row: IdeaRow): string[] {
  try {
    if (row.title_summaries && typeof row.title_summaries === 'string' && row.title_summaries.startsWith('[')) {
      return JSON.parse(row.title_summaries);
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
  const miniIdeas = parseMiniIdeas(row);
  const titleSummaries = parseTitleSummaries(row);
  
  // Ensure title_summaries array matches mini_ideas length
  // If title_summaries is shorter or missing, pad with empty strings
  // If title_summaries is longer, truncate it
  const normalizedTitleSummaries = miniIdeas.map((_, index) => 
    titleSummaries[index] || ''
  );

  return {
    id: row.id,
    date: row.date,
    ph_name: row.ph_name,
    ph_tagline: row.ph_tagline,
    ph_description: row.ph_tagline, // ph_tagline stores the full description
    ph_url: row.ph_url,
    ph_upvotes: row.ph_upvotes,
    ph_image: row.ph_image || undefined,
    mini_ideas: miniIdeas,
    title_summaries: normalizedTitleSummaries,
  };
}

