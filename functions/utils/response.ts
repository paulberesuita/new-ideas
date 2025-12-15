// Response helpers for consistent API responses

import { getCorsHeaders } from './cors';
import type { ApiResponse } from './types';

/**
 * Create a successful JSON response
 */
export function jsonResponse<T>(
  data: T,
  request: Request,
  status: number = 200,
  additionalHeaders: Record<string, string> = {}
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...getCorsHeaders(request),
      'Content-Type': 'application/json',
      ...additionalHeaders,
    },
  });
}

/**
 * Create an error response
 */
export function errorResponse(
  error: string | Error,
  request: Request,
  status: number = 500
): Response {
  const errorMessage = error instanceof Error ? error.message : error;
  
  const response: ApiResponse = {
    success: false,
    error: errorMessage,
  };

  return jsonResponse(response, request, status);
}

/**
 * Create a success response with optional data
 */
export function successResponse<T>(
  data?: T,
  request?: Request,
  additionalFields: Record<string, any> = {}
): Response {
  const response: ApiResponse<T> = {
    success: true,
    ...(data !== undefined && { data }),
    ...additionalFields,
  };

  // If no request provided, use minimal headers (for cases where request isn't available)
  if (!request) {
    return new Response(JSON.stringify(response), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }

  return jsonResponse(response, request);
}

