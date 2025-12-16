import { handleCorsPreflight } from '../utils/cors';
import { successResponse, errorResponse } from '../utils/response';
import { getTodayDateString } from '../utils/validation';
import { getPromptFromRecipe } from '../utils/prompt';
import type { Env, Idea, PagesFunctionContext, RecipeRow } from '../utils/types';

interface GenerateRequest {
  type: 'url' | 'prompt' | 'image';
  url?: string;
  prompt?: string;
  image?: string; // Base64 encoded image
  recipe_id?: number;
}

// Fetch and parse a URL to extract content
async function fetchUrlContent(url: string): Promise<{ title: string; description: string; image?: string }> {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; SparkBot/1.0)',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch URL: ${response.statusText}`);
    }

    const html = await response.text();

    // Extract title
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim() : url;

    // Extract meta description
    const descMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i) ||
                      html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*name=["']description["']/i);
    const description = descMatch ? descMatch[1].trim() : '';

    // Extract OG image
    const ogImageMatch = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i) ||
                         html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']/i);
    const image = ogImageMatch ? ogImageMatch[1] : undefined;

    return { title, description, image };
  } catch (error) {
    console.error('Error fetching URL:', error);
    return { title: url, description: '' };
  }
}

// Build generate prompt from recipe settings
function buildGeneratePrompt(
  source: { name: string; description: string; url?: string },
  promptStyle?: string,
  exclusions?: string[]
): string {
  const defaultPromptStyle = 'Focus on web apps or Chrome extensions that are buildable in a weekend. AI agent ideas are encouraged - automations, bots, or AI-powered tools.';
  const defaultExclusions = [
    'embedding external content (TikTok, YouTube, etc.)',
    'video generation tools',
    'A/B testing tools',
  ];

  const style = promptStyle || defaultPromptStyle;
  const excludeList = exclusions && exclusions.length > 0 ? exclusions : defaultExclusions;
  const exclusionLines = excludeList.map(e => `- NO ideas involving ${e}`).join('\n');

  return `You are a creative indie hacker looking for weekend project ideas. Analyze this inspiration source and generate 3 unique project ideas.

INSPIRATION SOURCE:
Name: ${source.name}
Description: ${source.description}
${source.url ? `URL: ${source.url}` : ''}

IMPORTANT GUIDELINES:
- Ideas should be buildable by a solo developer in a weekend
- ${style}
${exclusionLines}
- Don't just simplify the original product - create something NEW inspired by the core concept
- Each idea should be 1-2 sentences describing what it does and why it's useful
- Be specific and actionable

Return a JSON object with this structure:
{
  "mini_ideas": ["first idea", "second idea", "third idea"],
  "title_summaries": ["Short Title 1", "Short Title 2", "Short Title 3"]
}

For title_summaries:
- Create a concise title for each idea (MAXIMUM 6 WORDS)
- The title should capture the essence of the idea
- Make it catchy and descriptive`;
}

// Get recipe settings from database
async function getRecipeSettings(db: Env['IDEAS_DB'], recipeId?: number): Promise<{ prompt_style?: string; exclusions?: string[] }> {
  try {
    let recipe: RecipeRow | null = null;

    if (recipeId) {
      recipe = await db.prepare('SELECT * FROM recipes WHERE id = ?').bind(recipeId).first() as RecipeRow | null;
    } else {
      recipe = await db.prepare('SELECT * FROM recipes WHERE is_default = 1 LIMIT 1').first() as RecipeRow | null;
    }

    if (recipe) {
      const exclusions = recipe.exclusions ? JSON.parse(recipe.exclusions) : undefined;
      return {
        prompt_style: recipe.prompt_style || undefined,
        exclusions,
      };
    }
  } catch (error) {
    console.error('Error getting recipe settings:', error);
  }
  return {};
}

// Generate ideas using Claude
async function generateIdeas(
  apiKey: string,
  source: { name: string; description: string; url?: string; image?: string },
  recipeSettings: { prompt_style?: string; exclusions?: string[] }
): Promise<{ mini_ideas: string[]; title_summaries: string[] }> {
  const prompt = buildGeneratePrompt(source, recipeSettings.prompt_style, recipeSettings.exclusions);

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

  // Extract JSON from the response
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('Could not parse Claude response as JSON');
  }

  return JSON.parse(jsonMatch[0]);
}

// Build image prompt from recipe settings
function buildImagePrompt(
  additionalPrompt?: string,
  promptStyle?: string,
  exclusions?: string[]
): string {
  const defaultPromptStyle = 'Focus on web apps or Chrome extensions that are buildable in a weekend. AI agent ideas are encouraged - automations, bots, or AI-powered tools.';
  const defaultExclusions = [
    'embedding external content (TikTok, YouTube, etc.)',
    'video generation tools',
    'A/B testing tools',
  ];

  const style = promptStyle || defaultPromptStyle;
  const excludeList = exclusions && exclusions.length > 0 ? exclusions : defaultExclusions;
  const exclusionLines = excludeList.map(e => `- NO ideas involving ${e}`).join('\n');

  return `Analyze this image/screenshot and generate 3 unique weekend project ideas inspired by what you see.

${additionalPrompt ? `Additional context: ${additionalPrompt}` : ''}

IMPORTANT GUIDELINES:
- Ideas should be buildable by a solo developer in a weekend
- ${style}
${exclusionLines}
- Each idea should be 1-2 sentences describing what it does and why it's useful
- Be specific and actionable

Return a JSON object with this structure:
{
  "source_name": "Brief name describing what's in the image",
  "source_description": "One sentence describing the image content",
  "mini_ideas": ["first idea", "second idea", "third idea"],
  "title_summaries": ["Short Title 1", "Short Title 2", "Short Title 3"]
}

For title_summaries:
- Create a concise title for each idea (MAXIMUM 6 WORDS)
- The title should capture the essence of the idea`;
}

// Generate ideas from an image using Claude Vision
async function generateIdeasFromImage(
  apiKey: string,
  imageBase64: string,
  additionalPrompt?: string,
  recipeSettings?: { prompt_style?: string; exclusions?: string[] }
): Promise<{ mini_ideas: string[]; title_summaries: string[]; source_name: string; source_description: string }> {
  // Remove data URL prefix if present
  const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');
  const mediaType = imageBase64.match(/^data:(image\/\w+);base64,/)?.[1] || 'image/png';

  const prompt = buildImagePrompt(additionalPrompt, recipeSettings?.prompt_style, recipeSettings?.exclusions);

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
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: mediaType,
                data: base64Data,
              },
            },
            {
              type: 'text',
              text: prompt,
            },
          ],
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

  // Extract JSON from the response
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('Could not parse Claude response as JSON');
  }

  return JSON.parse(jsonMatch[0]);
}

// Save idea to database
async function saveIdea(
  db: Env['IDEAS_DB'],
  idea: {
    date: string;
    name: string;
    description: string;
    url: string;
    image?: string;
    mini_ideas: string[];
    title_summaries: string[];
  }
): Promise<void> {
  const stmt = db.prepare(`
    INSERT INTO ideas (date, ph_name, ph_tagline, ph_url, ph_upvotes, ph_image, mini_idea, title_summaries)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  await stmt
    .bind(
      idea.date,
      idea.name,
      idea.description,
      idea.url,
      0, // No upvotes for custom sources
      idea.image || null,
      JSON.stringify(idea.mini_ideas),
      JSON.stringify(idea.title_summaries)
    )
    .run();
}

export const onRequestOptions = async (context: { request: Request }) => {
  return handleCorsPreflight(context.request);
};

export const onRequestPost = async (context: PagesFunctionContext) => {
  const { request, env } = context;

  try {
    if (!env.ANTHROPIC_API_KEY) {
      return errorResponse('ANTHROPIC_API_KEY not configured', request, 500);
    }

    const body: GenerateRequest = await request.json();
    const today = getTodayDateString();

    // Get recipe settings
    const recipeSettings = await getRecipeSettings(env.IDEAS_DB, body.recipe_id);

    if (body.type === 'url' && body.url) {
      // Handle URL input
      const urlContent = await fetchUrlContent(body.url);
      const ideas = await generateIdeas(env.ANTHROPIC_API_KEY, {
        name: urlContent.title,
        description: urlContent.description,
        url: body.url,
      }, recipeSettings);

      await saveIdea(env.IDEAS_DB, {
        date: today,
        name: urlContent.title,
        description: urlContent.description,
        url: body.url,
        image: urlContent.image,
        mini_ideas: ideas.mini_ideas,
        title_summaries: ideas.title_summaries,
      });

      return successResponse({ count: ideas.mini_ideas.length }, request);
    }

    if (body.type === 'prompt' && body.prompt) {
      // Handle text prompt input
      const ideas = await generateIdeas(env.ANTHROPIC_API_KEY, {
        name: 'Custom Prompt',
        description: body.prompt,
      }, recipeSettings);

      await saveIdea(env.IDEAS_DB, {
        date: today,
        name: 'Custom Prompt',
        description: body.prompt,
        url: '#prompt',
        mini_ideas: ideas.mini_ideas,
        title_summaries: ideas.title_summaries,
      });

      return successResponse({ count: ideas.mini_ideas.length }, request);
    }

    if (body.type === 'image' && body.image) {
      // Handle image input
      const ideas = await generateIdeasFromImage(
        env.ANTHROPIC_API_KEY,
        body.image,
        body.prompt,
        recipeSettings
      );

      await saveIdea(env.IDEAS_DB, {
        date: today,
        name: ideas.source_name || 'Screenshot',
        description: ideas.source_description || body.prompt || 'Inspired by screenshot',
        url: '#screenshot',
        mini_ideas: ideas.mini_ideas,
        title_summaries: ideas.title_summaries,
      });

      return successResponse({ count: ideas.mini_ideas.length }, request);
    }

    return errorResponse('Invalid request: must provide type and corresponding data', request, 400);
  } catch (error) {
    return errorResponse(error as Error, request);
  }
};
