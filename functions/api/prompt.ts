import { handleCorsPreflight } from '../utils/cors';
import { successResponse, errorResponse } from '../utils/response';
import type { PagesFunctionContext } from '../utils/types';

// Default prompt template
const DEFAULT_PROMPT = `You are a creative indie hacker looking for weekend project ideas. Analyze these top {productCount} Product Hunt launches and use them as INSPIRATION to generate 3 unique project ideas for each.

IMPORTANT GUIDELINES:
- Ideas should be buildable by a solo developer in a weekend
- Focus on web apps or Chrome extensions
- NO ideas involving embedding external content (TikTok, YouTube, etc.)
- AI agent ideas are encouraged - automations, bots, or AI-powered tools
- Don't just simplify the original product - create something NEW inspired by the core concept
- Each idea should be 1-2 sentences describing what it does and why it's useful
- Be specific and actionable

Products:
{products}

Return a JSON array with this structure - one object for each product ({productCount} total):
[
  {
    "mini_ideas": ["first idea", "second idea", "third idea"]
  }
]`;

// Note: D1 doesn't support exec() for creating tables
// The settings table should be created via migration
// For now, we'll handle gracefully if it doesn't exist

export const onRequestOptions = async (context: { request: Request }) => {
  return handleCorsPreflight(context.request);
};

// GET: Retrieve the current prompt
export const onRequestGet = async (context: PagesFunctionContext) => {
  const { request, env } = context;

  try {
    const result = await env.IDEAS_DB.prepare(`
      SELECT value FROM settings WHERE key = 'prompt'
    `).first();

    const prompt = result ? (result as { value: string }).value : DEFAULT_PROMPT;

    return successResponse({ prompt }, request);
  } catch (error: any) {
    // If table doesn't exist, return default prompt
    if (error?.message?.includes('no such table')) {
      return successResponse({ prompt: DEFAULT_PROMPT }, request);
    }
    return errorResponse(error as Error, request);
  }
};

// POST: Save a new prompt
export const onRequestPost = async (context: PagesFunctionContext) => {
  const { request, env } = context;

  try {
    const body = await request.json();
    const { prompt } = body;

    if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
      return errorResponse('Prompt is required and must be a non-empty string', request, 400);
    }

    // Save or update the prompt
    // Note: If table doesn't exist, this will fail - user needs to create it via migration
    const result = await env.IDEAS_DB.prepare(`
      INSERT INTO settings (key, value, updated_at)
      VALUES ('prompt', ?, datetime('now'))
      ON CONFLICT(key) DO UPDATE SET
        value = excluded.value,
        updated_at = datetime('now')
    `).bind(prompt.trim()).run();

    return successResponse({ success: true }, request);
  } catch (error: any) {
    // If table doesn't exist, provide helpful error
    if (error?.message?.includes('no such table')) {
      return errorResponse('Settings table does not exist. Please create it first using: CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT (datetime(\'now\')))', request, 500);
    }
    return errorResponse(error as Error, request);
  }
};

