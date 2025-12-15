// CORS configuration and helpers

// TODO: Update this to your actual domain in production
// For local development, '*' is acceptable, but for production use your domain
const ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:8788', // Wrangler dev server
  'https://new-ideas.pages.dev',
  // Add your custom domain here when you set it up
];

/**
 * Get CORS headers based on the request origin
 */
export function getCorsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get('Origin');
  const allowedOrigin = origin && ALLOWED_ORIGINS.includes(origin) 
    ? origin 
    : ALLOWED_ORIGINS.includes('*') 
      ? '*' 
      : ALLOWED_ORIGINS[0]; // Default to first allowed origin

  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Credentials': 'true',
  };
}

/**
 * Handle OPTIONS request for CORS preflight
 */
export function handleCorsPreflight(request: Request): Response {
  return new Response(null, {
    headers: getCorsHeaders(request),
  });
}

