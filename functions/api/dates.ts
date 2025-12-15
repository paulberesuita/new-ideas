import { handleCorsPreflight } from '../utils/cors';
import { successResponse, errorResponse } from '../utils/response';
import type { PagesFunctionContext } from '../utils/types';

export const onRequestOptions = async (context: { request: Request }) => {
  return handleCorsPreflight(context.request);
};

export const onRequestGet = async (context: PagesFunctionContext) => {
  const { request, env } = context;

  try {
    const { results } = await env.IDEAS_DB.prepare(`
      SELECT DISTINCT date FROM ideas ORDER BY date DESC
    `).all();

    const dates = (results as Array<{ date: string }>).map((r) => r.date);

    return successResponse({ dates }, request);
  } catch (error) {
    return errorResponse(error as Error, request);
  }
};
