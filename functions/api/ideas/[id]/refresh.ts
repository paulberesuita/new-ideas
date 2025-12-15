import { handleCorsPreflight } from '../../../utils/cors';
import { successResponse, errorResponse } from '../../../utils/response';
import type { PagesFunctionContext, Idea } from '../../../utils/types';

// Helper function to generate ideas for a single product
async function generateIdeasForProduct(
  product: {
    name: string;
    tagline: string;
    description: string;
  },
  apiKey: string
): Promise<string[]> {
  const prompt = `You are a creative indie hacker looking for weekend project ideas. Analyze this Product Hunt launch and use it as INSPIRATION to generate 3 unique project ideas.

IMPORTANT GUIDELINES:
- Ideas should be buildable by a solo developer in a weekend
- Focus on web apps or Chrome extensions
- NO ideas involving embedding external content (TikTok, YouTube, etc.)
- AI agent ideas are encouraged - automations, bots, or AI-powered tools
- Don't just simplify the original product - create something NEW inspired by the core concept
- Each idea should be 1-2 sentences describing what it does and why it's useful
- Be specific and actionable

Product:
${product.name} - ${product.tagline}
${product.description}

Return a JSON array with this structure:
{
  "mini_ideas": ["first idea", "second idea", "third idea"]
}`;

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
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('Could not parse Claude response as JSON');
  }

  const result = JSON.parse(jsonMatch[0]);
  return result.mini_ideas || [];
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
    const newMiniIdeas = await generateIdeasForProduct(
      {
        name: idea.ph_name,
        tagline: idea.ph_tagline,
        description: idea.ph_tagline, // ph_tagline stores the full description
      },
      env.ANTHROPIC_API_KEY
    );

    // Update the idea in the database
    const miniIdeasJson = JSON.stringify(newMiniIdeas);
    await env.IDEAS_DB.prepare(`
      UPDATE ideas 
      SET mini_idea = ?, created_at = datetime('now')
      WHERE id = ?
    `)
      .bind(miniIdeasJson, parseInt(ideaId, 10))
      .run();

    return successResponse(
      { mini_ideas: newMiniIdeas },
      request
    );
  } catch (error) {
    return errorResponse(error as Error, request);
  }
};

