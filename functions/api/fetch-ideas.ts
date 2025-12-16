import { handleCorsPreflight } from '../utils/cors';
import { successResponse, errorResponse } from '../utils/response';
import { getTodayDateString, isValidDateString } from '../utils/validation';
import { getPromptFromRecipe, formatPrompt } from '../utils/prompt';
import type {
  Env,
  ProductHuntPost,
  ProductHuntResponse,
  Idea,
  PagesFunctionContext,
} from '../utils/types';

async function fetchProductHuntLaunches(apiToken?: string, targetDate?: string): Promise<ProductHuntPost[]> {
  // Build date filter if a specific date is provided
  let dateFilter = '';
  if (targetDate) {
    // Create date range for the specific day (start of day to end of day in UTC)
    const startDate = `${targetDate}T00:00:00Z`;
    const endDate = `${targetDate}T23:59:59Z`;
    dateFilter = `, postedAfter: "${startDate}", postedBefore: "${endDate}"`;
  }

  const query = `
    query {
      posts(first: 3, order: VOTES${dateFilter}) {
        edges {
          node {
            id
            name
            tagline
            description
            url
            votesCount
            thumbnail {
              url
            }
          }
        }
      }
    }
  `;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  };

  // Add authorization header if token is provided
  if (apiToken) {
    headers['Authorization'] = `Bearer ${apiToken}`;
  }

  const response = await fetch('https://api.producthunt.com/v2/api/graphql', {
    method: 'POST',
    headers,
    body: JSON.stringify({ query }),
  });

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('Product Hunt API requires authentication. Please set PRODUCT_HUNT_API_TOKEN environment variable. Get your token at https://api.producthunt.com/v2/oauth/applications');
    }
    throw new Error(`Product Hunt API error: ${response.statusText}`);
  }

  const data: ProductHuntResponse = await response.json();

  // Check for GraphQL errors
  if (data.errors) {
    throw new Error(`Product Hunt API GraphQL errors: ${JSON.stringify(data.errors)}`);
  }

  if (!data.data || !data.data.posts) {
    throw new Error(`Invalid response from Product Hunt API: ${JSON.stringify(data)}`);
  }

  return data.data.posts.edges;
}

async function generateIdeasWithClaude(
  posts: ProductHuntPost[],
  apiKey: string,
  targetDate: string,
  db: Env['IDEAS_DB'],
  recipeId?: number
): Promise<Idea[]> {
  const products = posts.map((p) => ({
    name: p.node.name,
    tagline: p.node.tagline,
    description: p.node.description || p.node.tagline,
    url: p.node.url,
    upvotes: p.node.votesCount,
    image: p.node.thumbnail?.url || null,
  }));

  const productCount = products.length;

  // Get prompt from recipe or use default
  const promptTemplate = await getPromptFromRecipe(db, recipeId);
  const prompt = formatPrompt(promptTemplate, {
    productCount,
    products,
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
      max_tokens: 3000,
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
  const jsonMatch = content.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    throw new Error('Could not parse Claude response as JSON');
  }

  const ideas = JSON.parse(jsonMatch[0]);

  // Combine with Product Hunt data
  const result: Idea[] = [];

  products.forEach((product, idx) => {
    if (product && ideas[idx]) {
      result.push({
        date: targetDate,
        ph_name: product.name,
        ph_tagline: product.tagline,
        ph_description: product.description,
        ph_url: product.url,
        ph_upvotes: product.upvotes,
        ph_image: product.image || undefined,
        mini_ideas: ideas[idx].mini_ideas || [],
        title_summaries: ideas[idx].title_summaries || [],
      });
    }
  });

  return result;
}

async function saveIdeasToDB(ideas: Idea[], db: Env['IDEAS_DB']): Promise<void> {
  const stmt = db.prepare(`
    INSERT INTO ideas (date, ph_name, ph_tagline, ph_url, ph_upvotes, ph_image, mini_idea, title_summaries)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const idea of ideas) {
    // Store mini_ideas as JSON string in the mini_idea column
    const miniIdeasJson = JSON.stringify(idea.mini_ideas || []);
    // Store title_summaries as JSON string
    const titleSummariesJson = JSON.stringify(idea.title_summaries || []);
    await stmt
      .bind(
        idea.date,
        idea.ph_name,
        idea.ph_description || idea.ph_tagline,
        idea.ph_url,
        idea.ph_upvotes,
        idea.ph_image || null,
        miniIdeasJson,
        titleSummariesJson
      )
      .run();
  }
  // Store description in ph_tagline column (we'll use it to display full description)
}

export const onRequestOptions = async (context: { request: Request }) => {
  return handleCorsPreflight(context.request);
};

export const onRequestPost = async (context: PagesFunctionContext) => {
  const { request, env } = context;
  const url = new URL(request.url);
  const specificDate = url.searchParams.get('date'); // Format: YYYY-MM-DD
  const recipeIdParam = url.searchParams.get('recipe_id');
  const recipeId = recipeIdParam ? parseInt(recipeIdParam, 10) : undefined;

  try {
    if (!env.ANTHROPIC_API_KEY) {
      return errorResponse('ANTHROPIC_API_KEY not configured', request, 500);
    }

    // Determine the target date (default to today)
    const today = getTodayDateString();
    const targetDate = specificDate || today;

    // Validate date format if provided
    if (specificDate && !isValidDateString(specificDate)) {
      return errorResponse('Invalid date format. Expected YYYY-MM-DD', request, 400);
    }

    // Fetch Product Hunt launches for the target date
    const posts = await fetchProductHuntLaunches(env.PRODUCT_HUNT_API_TOKEN, targetDate);

    if (posts.length === 0) {
      return errorResponse(`No Product Hunt launches found for ${targetDate}`, request, 404);
    }

    // Generate ideas with Claude using the selected recipe
    const ideas = await generateIdeasWithClaude(posts, env.ANTHROPIC_API_KEY, targetDate, env.IDEAS_DB, recipeId);

    // Save to database
    await saveIdeasToDB(ideas, env.IDEAS_DB);

    return successResponse(
      { count: ideas.length },
      request
    );
  } catch (error) {
    return errorResponse(error as Error, request);
  }
};
