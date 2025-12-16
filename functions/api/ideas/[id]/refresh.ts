import { handleCorsPreflight } from '../../../utils/cors';
import { successResponse, errorResponse } from '../../../utils/response';
import { getPrompt, formatPrompt } from '../../../utils/prompt';
import type { PagesFunctionContext, Idea, Env } from '../../../utils/types';

// Helper function to generate ideas for a single product
async function generateIdeasForProduct(
  product: {
    name: string;
    tagline: string;
    description: string;
  },
  apiKey: string,
  db: Env['IDEAS_DB']
): Promise<{ mini_ideas: string[]; title_summaries: string[] }> {
  // Get custom prompt from database or use default
  const promptTemplate = await getPrompt(db);
  
  // For single product, adapt the prompt template
  // Replace {productCount} with 1 and {products} with single product
  const prompt = formatPrompt(promptTemplate, {
    productCount: 1,
    products: [{
      name: product.name,
      tagline: product.tagline,
      description: product.description,
    }],
    productName: product.name,
    productTagline: product.tagline,
    productDescription: product.description,
  });

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Claude API error: ${response.statusText} - ${error}`);
  }

  const data = await response.json();
  const content = data.content[0].text;

  // Extract JSON from the response (Claude might wrap it in markdown)
  // Try to match array first (for multiple products), then object (for single product)
  const arrayMatch = content.match(/\[[\s\S]*\]/);
  const objectMatch = content.match(/\{[\s\S]*\}/);
  
  let result;
  if (arrayMatch) {
    const parsed = JSON.parse(arrayMatch[0]);
    result = parsed[0]; // Get first object from array
  } else if (objectMatch) {
    result = JSON.parse(objectMatch[0]);
  } else {
    throw new Error('Could not parse Claude response as JSON');
  }

  return {
    mini_ideas: result.mini_ideas || [],
    title_summaries: result.title_summaries || [],
  };
}

export const onRequestOptions = async (context: { request: Request }) => {
  return handleCorsPreflight(context.request);
};

export const onRequestPost = async (context: PagesFunctionContext) => {
  const { request, env, params } = context;
  const ideaId = params?.id;

  try {
    if (!env.ANTHROPIC_API_KEY) {
      return errorResponse('ANTHROPIC_API_KEY not configured', request, 500);
    }

    if (!ideaId) {
      return errorResponse('Idea ID is required', request, 400);
    }

    // Get the existing idea from database
    const ideaResult = await env.IDEAS_DB.prepare(`
      SELECT * FROM ideas WHERE id = ?
    `)
      .bind(parseInt(ideaId, 10))
      .first();

    if (!ideaResult) {
      return errorResponse('Idea not found', request, 404);
    }

    const idea = ideaResult as any;

    // Generate new ideas for this product
    const generated = await generateIdeasForProduct(
      {
        name: idea.ph_name,
        tagline: idea.ph_tagline,
        description: idea.ph_tagline, // ph_tagline stores the full description
      },
      env.ANTHROPIC_API_KEY,
      env.IDEAS_DB
    );

    // Update the idea in the database
    const miniIdeasJson = JSON.stringify(generated.mini_ideas);
    const titleSummariesJson = JSON.stringify(generated.title_summaries);
    await env.IDEAS_DB.prepare(`
      UPDATE ideas 
      SET mini_idea = ?, title_summaries = ?, created_at = datetime('now')
      WHERE id = ?
    `)
      .bind(miniIdeasJson, titleSummariesJson, parseInt(ideaId, 10))
      .run();

    return successResponse(
      { 
        mini_ideas: generated.mini_ideas,
        title_summaries: generated.title_summaries,
      },
      request
    );
  } catch (error) {
    return errorResponse(error as Error, request);
  }
};

