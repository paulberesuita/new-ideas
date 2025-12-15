import { handleCorsPreflight } from '../../utils/cors';
import { successResponse, errorResponse } from '../../utils/response';
import { isValidDateString } from '../../utils/validation';
import type { PagesFunctionContext } from '../../utils/types';

export const onRequestOptions = async (context: { request: Request }) => {
  return handleCorsPreflight(context.request);
};

export const onRequestDelete = async (context: PagesFunctionContext) => {
  const { request, params, env } = context;
  const date = params?.date;

  try {
    if (!date) {
      return errorResponse('Date parameter is required', request, 400);
    }

    if (!isValidDateString(date)) {
      return errorResponse('Invalid date format. Expected YYYY-MM-DD', request, 400);
    }

    // Delete all ideas for the specified date
    const result = await env.IDEAS_DB.prepare(`
      DELETE FROM ideas WHERE date = ?
    `)
      .bind(date)
      .run();

    return successResponse(
      { deleted: result.meta.changes || 0 },
      request
    );
  } catch (error) {
    return errorResponse(error as Error, request);
  }
};

