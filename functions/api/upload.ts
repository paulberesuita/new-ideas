import { handleCorsPreflight } from '../utils/cors';
import { successResponse, errorResponse } from '../utils/response';
import type { Env, PagesFunctionContext } from '../utils/types';

export const onRequestOptions = async (context: { request: Request }) => {
  return handleCorsPreflight(context.request);
};

// POST /api/upload - Upload an image to R2
export const onRequestPost = async (context: PagesFunctionContext) => {
  const { request, env } = context;

  try {
    // Check if R2 bucket is available
    if (!env.IMAGES_BUCKET) {
      return errorResponse('Image storage not configured', request, 500);
    }

    // Parse multipart form data
    const formData = await request.formData();
    const file = formData.get('image') as File | null;

    if (!file) {
      return errorResponse('No image file provided', request, 400);
    }

    // Validate file type
    if (!file.type.startsWith('image/')) {
      return errorResponse('File must be an image', request, 400);
    }

    // Validate file size (max 10MB)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      return errorResponse('Image size must be less than 10MB', request, 400);
    }

    // Generate unique filename
    const timestamp = Date.now();
    const randomString = Math.random().toString(36).substring(2, 15);
    const extension = file.name.split('.').pop() || 'jpg';
    const filename = `recipes/${timestamp}-${randomString}.${extension}`;

    // Upload to R2
    await env.IMAGES_BUCKET.put(filename, file.stream(), {
      httpMetadata: {
        contentType: file.type,
        cacheControl: 'public, max-age=31536000', // Cache for 1 year
      },
    });

    // Generate public URL using our proxy endpoint
    const url = new URL(request.url);
    const baseUrl = `${url.protocol}//${url.host}`;
    const publicUrl = `${baseUrl}/api/image?path=${encodeURIComponent(filename)}`;

    return successResponse(
      {
        url: publicUrl,
        filename,
        size: file.size,
        type: file.type,
      },
      request
    );
  } catch (error) {
    console.error('Upload error:', error);
    return errorResponse(error as Error, request);
  }
};
