import { handleCorsPreflight } from '../utils/cors';
import { successResponse, errorResponse } from '../utils/response';
import type { Env, PagesFunctionContext } from '../utils/types';

export const onRequestOptions = async (context: { request: Request }) => {
  return handleCorsPreflight(context.request);
};

// GET /api/hero-images - List available hero images from R2
export const onRequestGet = async (context: PagesFunctionContext) => {
  const { request, env } = context;

  try {
    if (!env.IMAGES_BUCKET) {
      return errorResponse('Image storage not configured', request, 500);
    }

    // List images in the heroes/ folder
    const list = await env.IMAGES_BUCKET.list({ prefix: 'heroes/' });

    // Generate public URLs for each image
    const url = new URL(request.url);
    const baseUrl = `${url.protocol}//${url.host}`;

    const images = list.objects.map((obj) => ({
      key: obj.key,
      url: `${baseUrl}/api/image?path=${encodeURIComponent(obj.key)}`,
      name: obj.key.replace('heroes/', '').replace(/\.[^.]+$/, ''), // Remove prefix and extension
      size: obj.size,
      uploaded: obj.uploaded,
    }));

    return successResponse({ images }, request);
  } catch (error) {
    console.error('Error listing hero images:', error);
    return errorResponse(error as Error, request);
  }
};
