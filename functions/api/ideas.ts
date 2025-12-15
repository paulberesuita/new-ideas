import { handleCorsPreflight } from '../utils/cors';
import { successResponse, errorResponse } from '../utils/response';
import { parseIntSafe, isValidDateString } from '../utils/validation';
import { rowToIdea } from '../utils/db';
import type { PagesFunctionContext, IdeaRow } from '../utils/types';

export const onRequestOptions = async (context: { request: Request }) => {
  return handleCorsPreflight(context.request);
};

export const onRequestGet = async (context: PagesFunctionContext) => {
  const { request, env } = context;
  const url = new URL(request.url);

  try {
    const filterDate = url.searchParams.get('date'); // Optional: filter by specific date

    // Validate date if provided
    if (filterDate && !isValidDateString(filterDate)) {
      return errorResponse('Invalid date format. Expected YYYY-MM-DD', request, 400);
    }

    let results: IdeaRow[];
    if (filterDate) {
      // Fetch ideas for a specific date
      const query = await env.IDEAS_DB.prepare(`
        SELECT * FROM ideas
        WHERE date = ?
        ORDER BY created_at DESC
      `).bind(filterDate).all();
      results = query.results as IdeaRow[];
    } else {
      // Fetch all ideas (for backwards compatibility)
      const page = parseIntSafe(url.searchParams.get('page'), 1);
      const limit = parseIntSafe(url.searchParams.get('limit'), 30);
      const offset = (page - 1) * limit;

      const query = await env.IDEAS_DB.prepare(`
        SELECT * FROM ideas
        ORDER BY date DESC, created_at DESC
        LIMIT ? OFFSET ?
      `).bind(limit, offset).all();
      results = query.results as IdeaRow[];
    }

    // Group by date and convert to Idea objects
    const grouped: Record<string, ReturnType<typeof rowToIdea>[]> = {};
    for (const row of results) {
      if (!grouped[row.date]) {
        grouped[row.date] = [];
      }
      grouped[row.date].push(rowToIdea(row));
    }

    // Check if there are more results (only relevant when not filtering by date)
    let hasMore = false;
    let page = 1;
    if (!filterDate) {
      page = parseIntSafe(url.searchParams.get('page'), 1);
      const limit = parseIntSafe(url.searchParams.get('limit'), 30);
      const offset = (page - 1) * limit;

      const countResult = await env.IDEAS_DB.prepare(`
        SELECT COUNT(*) as total FROM ideas
      `).first();

      const total = (countResult as { total: number })?.total || 0;
      hasMore = offset + limit < total;
    }

    return successResponse(
      {
        ideas: grouped,
        hasMore,
        page,
      },
      request
    );
  } catch (error) {
    return errorResponse(error as Error, request);
  }
};
