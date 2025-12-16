import { errorResponse } from '../utils/response';
import type { Env, PagesFunctionContext } from '../utils/types';

// GET /api/image?path=heroes/technology.jpg - Serve images from R2
export const onRequestGet = async (context: PagesFunctionContext) => {
  const { request, env } = context;

  try {
    if (!env.IMAGES_BUCKET) {
      return new Response('Image storage not configured', { status: 500 });
    }

    // Get path from query parameter
    const url = new URL(request.url);
    const imagePath = url.searchParams.get('path');

    if (!imagePath) {
      return new Response('Image path required (use ?path=...)', { status: 400 });
    }

    // Get the image from R2
    const object = await env.IMAGES_BUCKET.get(imagePath);

    if (!object) {
      return new Response('Image not found', { status: 404 });
    }

    // Get the content type from R2 metadata or default to image/jpeg
    const contentType = object.httpMetadata?.contentType || 'image/jpeg';

    // Return the image with appropriate headers
    return new Response(object.body, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': object.httpMetadata?.cacheControl || 'public, max-age=31536000',
        'ETag': object.etag,
      },
    });
  } catch (error) {
    console.error('Error serving image:', error);
    return errorResponse(error as Error, request);
  }
};
