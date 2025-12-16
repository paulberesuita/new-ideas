import { handleCorsPreflight } from '../../utils/cors';
import { successResponse, errorResponse } from '../../utils/response';
import type { Env, Recipe, RecipeRow, RecipeSource } from '../../utils/types';

interface PagesFunctionContext {
  request: Request;
  env: Env;
  params: { id: string };
}

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

// GET /api/recipes/:id - Get a single recipe
export const onRequestGet = async (context: PagesFunctionContext) => {
  const { request, env, params } = context;
  const id = parseInt(params.id, 10);

  if (isNaN(id)) {
    return errorResponse('Invalid recipe ID', request, 400);
  }

  try {
    const row = await env.IDEAS_DB.prepare(
      'SELECT * FROM recipes WHERE id = ?'
    ).bind(id).first() as RecipeRow | null;

    if (!row) {
      return errorResponse('Recipe not found', request, 404);
    }

    return successResponse(rowToRecipe(row), request);
  } catch (error) {
    return errorResponse(error as Error, request);
  }
};

// PUT /api/recipes/:id - Update a recipe
export const onRequestPut = async (context: PagesFunctionContext) => {
  const { request, env, params } = context;
  const id = parseInt(params.id, 10);

  if (isNaN(id)) {
    return errorResponse('Invalid recipe ID', request, 400);
  }

  try {
    const body = await request.json() as {
      name?: string;
      description?: string;
      prompt_style?: string;
      exclusions?: string[];
      source?: string | null;
    };

    // Check if recipe exists
    const existing = await env.IDEAS_DB.prepare(
      'SELECT * FROM recipes WHERE id = ?'
    ).bind(id).first() as RecipeRow | null;

    if (!existing) {
      return errorResponse('Recipe not found', request, 404);
    }

    // Build update query
    const updates: string[] = [];
    const values: any[] = [];

    if (body.name !== undefined) {
      if (!body.name.trim()) {
        return errorResponse('Recipe name cannot be empty', request, 400);
      }
      updates.push('name = ?');
      values.push(body.name.trim());
    }

    if (body.description !== undefined) {
      updates.push('description = ?');
      values.push(body.description?.trim() || null);
    }

    if (body.prompt_style !== undefined) {
      updates.push('prompt_style = ?');
      values.push(body.prompt_style?.trim() || null);
    }

    if (body.exclusions !== undefined) {
      updates.push('exclusions = ?');
      values.push(JSON.stringify(body.exclusions));
    }

    if (body.source !== undefined) {
      const validSources = ['producthunt', 'url', 'prompt', 'image'];
      const source = body.source && validSources.includes(body.source) ? body.source : null;
      updates.push('source = ?');
      values.push(source);
    }

    if (updates.length === 0) {
      return errorResponse('No fields to update', request, 400);
    }

    updates.push('updated_at = CURRENT_TIMESTAMP');
    values.push(id);

    await env.IDEAS_DB.prepare(`
      UPDATE recipes SET ${updates.join(', ')} WHERE id = ?
    `).bind(...values).run();

    // Fetch updated recipe
    const updated = await env.IDEAS_DB.prepare(
      'SELECT * FROM recipes WHERE id = ?'
    ).bind(id).first() as RecipeRow;

    return successResponse(rowToRecipe(updated), request);
  } catch (error) {
    return errorResponse(error as Error, request);
  }
};

// DELETE /api/recipes/:id - Delete a recipe
export const onRequestDelete = async (context: PagesFunctionContext) => {
  const { request, env, params } = context;
  const id = parseInt(params.id, 10);

  if (isNaN(id)) {
    return errorResponse('Invalid recipe ID', request, 400);
  }

  try {
    // Check if recipe exists and is not default
    const existing = await env.IDEAS_DB.prepare(
      'SELECT * FROM recipes WHERE id = ?'
    ).bind(id).first() as RecipeRow | null;

    if (!existing) {
      return errorResponse('Recipe not found', request, 404);
    }

    if (existing.is_default === 1) {
      return errorResponse('Cannot delete the default recipe', request, 400);
    }

    await env.IDEAS_DB.prepare(
      'DELETE FROM recipes WHERE id = ?'
    ).bind(id).run();

    return successResponse({ deleted: true }, request);
  } catch (error) {
    return errorResponse(error as Error, request);
  }
};
