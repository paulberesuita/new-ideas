// Prompt utility functions

import type { RecipeRow } from './types';

const DEFAULT_PROMPT_STYLE = `Focus on web apps or Chrome extensions that are buildable in a weekend. AI agent ideas are encouraged - automations, bots, or AI-powered tools.`;

const DEFAULT_EXCLUSIONS = [
  'embedding external content (TikTok, YouTube, etc.)',
  'video generation tools',
  'A/B testing tools',
];

function buildPrompt(promptStyle?: string, exclusions?: string[]): string {
  const style = promptStyle || DEFAULT_PROMPT_STYLE;
  const excludeList = exclusions && exclusions.length > 0 ? exclusions : DEFAULT_EXCLUSIONS;

  const exclusionLines = excludeList.map(e => `- NO ideas involving ${e}`).join('\n');

  return `You are a creative indie hacker looking for weekend project ideas. Analyze these top {productCount} Product Hunt launches and use them as INSPIRATION to generate 3 unique project ideas for each.

IMPORTANT GUIDELINES:
- Ideas should be buildable by a solo developer in a weekend
- ${style}
${exclusionLines}
- Don't just simplify the original product - create something NEW inspired by the core concept
- Each idea should be 1-2 sentences describing what it does and why it's useful
- Be specific and actionable

Products:
{products}

Return a JSON array with this structure - one object for each product ({productCount} total):
[
  {
    "mini_ideas": ["first idea", "second idea", "third idea"],
    "title_summaries": ["Short Title 1", "Short Title 2", "Short Title 3"]
  }
]

For title_summaries:
- Create a concise title for each idea (MAXIMUM 6 WORDS)
- The title should capture the essence of the idea
- Make it catchy and descriptive
- Each title should correspond to the idea at the same index in mini_ideas array`;
}

const DEFAULT_PROMPT = buildPrompt();

/**
 * Get the prompt from a recipe, or return default
 */
export async function getPromptFromRecipe(db: any, recipeId?: number): Promise<string> {
  // If no recipe specified, get default recipe
  if (!recipeId) {
    try {
      const defaultRecipe = await db.prepare(`
        SELECT * FROM recipes WHERE is_default = 1 LIMIT 1
      `).first() as RecipeRow | null;

      if (defaultRecipe) {
        const exclusions = defaultRecipe.exclusions
          ? JSON.parse(defaultRecipe.exclusions)
          : undefined;
        return buildPrompt(defaultRecipe.prompt_style || undefined, exclusions);
      }
    } catch (error: any) {
      console.error('Error getting default recipe:', error);
    }
    return DEFAULT_PROMPT;
  }

  try {
    const recipe = await db.prepare(`
      SELECT * FROM recipes WHERE id = ?
    `).bind(recipeId).first() as RecipeRow | null;

    if (recipe) {
      const exclusions = recipe.exclusions
        ? JSON.parse(recipe.exclusions)
        : undefined;
      return buildPrompt(recipe.prompt_style || undefined, exclusions);
    }

    return DEFAULT_PROMPT;
  } catch (error: any) {
    console.error('Error getting recipe:', error);
    return DEFAULT_PROMPT;
  }
}

/**
 * Get the custom prompt from database, or return default
 * @deprecated Use getPromptFromRecipe instead
 */
export async function getPrompt(db: any): Promise<string> {
  try {
    const result = await db.prepare(`
      SELECT value FROM settings WHERE key = 'prompt'
    `).first();

    return result ? (result as { value: string }).value : DEFAULT_PROMPT;
  } catch (error: any) {
    // If table doesn't exist, return default
    if (error?.message?.includes('no such table')) {
      return DEFAULT_PROMPT;
    }
    console.error('Error getting prompt:', error);
    return DEFAULT_PROMPT;
  }
}

/**
 * Replace placeholders in prompt template with actual values
 */
export function formatPrompt(
  promptTemplate: string,
  options: {
    productCount: number;
    products?: Array<{ name: string; tagline: string; description?: string }>;
    productName?: string;
    productTagline?: string;
    productDescription?: string;
  }
): string {
  let formatted = promptTemplate;

  // Replace productCount
  formatted = formatted.replace(/\{productCount\}/g, String(options.productCount));

  // Replace products list
  if (options.products) {
    const productsList = options.products
      .map((p, i) => `${i + 1}. ${p.name} - ${p.tagline}`)
      .join('\n');
    formatted = formatted.replace(/\{products\}/g, productsList);
  }

  // Replace single product fields (for refresh endpoint)
  if (options.productName) {
    formatted = formatted.replace(/\{productName\}/g, options.productName);
  }
  if (options.productTagline) {
    formatted = formatted.replace(/\{productTagline\}/g, options.productTagline);
  }
  if (options.productDescription) {
    formatted = formatted.replace(/\{productDescription\}/g, options.productDescription);
  }

  return formatted;
}

