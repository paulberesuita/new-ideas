import { handleCorsPreflight } from '../utils/cors';
import { successResponse, errorResponse } from '../utils/response';
import type { Env, PagesFunctionContext, Recipe, RecipeRow, RecipeSource } from '../utils/types';

// Convert database row to Recipe object
function rowToRecipe(row: RecipeRow): Recipe {
  let exclusions: string[] = [];
  try {
    if (row.exclusions && typeof row.exclusions === 'string') {
      exclusions = JSON.parse(row.exclusions);
    }
  } catch {
    exclusions = [];
  }

  return {
    id: row.id,
    name: row.name,
    description: row.description,
    prompt_style: row.prompt_style,
    exclusions,
    source: (row.source as RecipeSource) || null,
    is_default: row.is_default === 1,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export const onRequestOptions = async (context: { request: Request }) => {
  return handleCorsPreflight(context.request);
};

// GET /api/recipes - List all recipes
export const onRequestGet = async (context: PagesFunctionContext) => {
  const { request, env } = context;

  try {
    const result = await env.IDEAS_DB.prepare(
      'SELECT * FROM recipes ORDER BY is_default DESC, name ASC'
    ).all();

    const recipes = (result.results as RecipeRow[]).map(rowToRecipe);

    return successResponse(recipes, request);
  } catch (error) {
    return errorResponse(error as Error, request);
  }
};

// POST /api/recipes - Create a new recipe
export const onRequestPost = async (context: PagesFunctionContext) => {
  const { request, env } = context;

  try {
    const body = await request.json() as {
      name: string;
      description?: string;
      prompt_style?: string;
      exclusions?: string[];
      source?: string;
    };

    if (!body.name || !body.name.trim()) {
      return errorResponse('Recipe name is required', request, 400);
    }

    const exclusionsJson = JSON.stringify(body.exclusions || []);
    const validSources = ['producthunt', 'url', 'prompt', 'image'];
    const source = body.source && validSources.includes(body.source) ? body.source : null;

    const result = await env.IDEAS_DB.prepare(`
      INSERT INTO recipes (name, description, prompt_style, exclusions, source, is_default)
      VALUES (?, ?, ?, ?, ?, 0)
    `).bind(
      body.name.trim(),
      body.description?.trim() || null,
      body.prompt_style?.trim() || null,
      exclusionsJson,
      source
    ).run();

    if (!result.success) {
      return errorResponse('Failed to create recipe', request, 500);
    }

    // Fetch the newly created recipe
    const newRecipe = await env.IDEAS_DB.prepare(
      'SELECT * FROM recipes WHERE rowid = last_insert_rowid()'
    ).first() as RecipeRow;

    return successResponse(rowToRecipe(newRecipe), request);
  } catch (error) {
    return errorResponse(error as Error, request);
  }
};
