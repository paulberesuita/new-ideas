export interface Env {
  IDEAS_DB: D1Database;
  ANTHROPIC_API_KEY: string;
  PRODUCT_HUNT_API_TOKEN?: string;
}

interface ProductHuntPost {
  node: {
    id: string;
    name: string;
    tagline: string;
    description: string;
    url: string;
    votesCount: number;
    thumbnail?: {
      url: string;
    };
  };
}

interface ProductHuntResponse {
  data?: {
    posts: {
      edges: ProductHuntPost[];
    };
  };
  errors?: Array<{
    message: string;
    locations?: Array<{ line: number; column: number }>;
    path?: string[];
  }>;
}

interface Idea {
  date: string;
  ph_name: string;
  ph_tagline: string;
  ph_description: string;
  ph_url: string;
  ph_upvotes: number;
  ph_image?: string;
  mini_ideas: string[];
}

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
  targetDate: string
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
  const prompt = `You are a creative indie hacker looking for weekend project ideas. Analyze these top ${productCount} Product Hunt launches and use them as INSPIRATION to generate 3 unique project ideas for each.

IMPORTANT GUIDELINES:
- Ideas should be buildable by a solo developer in a weekend
- Focus on web apps or Chrome extensions
- NO ideas involving embedding external content (TikTok, YouTube, etc.)
- AI agent ideas are encouraged - automations, bots, or AI-powered tools
- Don't just simplify the original product - create something NEW inspired by the core concept
- Each idea should be 1-2 sentences describing what it does and why it's useful
- Be specific and actionable

Products:
${products.map((p, i) => `${i + 1}. ${p.name} - ${p.tagline}`).join('\n')}

Return a JSON array with this structure - one object for each product (${productCount} total):
[
  {
    "mini_ideas": ["first idea", "second idea", "third idea"]
  }
]`;

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
        ph_image: product.image || null,
        mini_ideas: ideas[idx].mini_ideas || [],
      });
    }
  });

  return result;
}

async function saveIdeasToDB(ideas: Idea[], db: D1Database): Promise<void> {
  const stmt = db.prepare(`
    INSERT INTO ideas (date, ph_name, ph_tagline, ph_url, ph_upvotes, ph_image, mini_idea)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  for (const idea of ideas) {
    // Store mini_ideas as JSON string in the mini_idea column
    const miniIdeasJson = JSON.stringify(idea.mini_ideas || []);
    await stmt
      .bind(
        idea.date,
        idea.ph_name,
        idea.ph_description || idea.ph_tagline,
        idea.ph_url,
        idea.ph_upvotes,
        idea.ph_image || null,
        miniIdeasJson
      )
      .run();
  }
  // Store description in ph_tagline column (we'll use it to display full description)
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export const onRequestOptions = async () => {
  return new Response(null, { headers: corsHeaders });
};

export const onRequestPost = async (context: any) => {
  const { request, env } = context;
  const url = new URL(request.url);
  const specificDate = url.searchParams.get('date'); // Format: YYYY-MM-DD

  try {
    if (!env.ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY not configured');
    }

    // Determine the target date (default to today)
    const today = new Date().toISOString().split('T')[0];
    const targetDate = specificDate || today;

    // Fetch Product Hunt launches for the target date
    const posts = await fetchProductHuntLaunches(env.PRODUCT_HUNT_API_TOKEN, targetDate);

    if (posts.length === 0) {
      throw new Error(`No Product Hunt launches found for ${targetDate}`);
    }

    // Generate ideas with Claude
    const ideas = await generateIdeasWithClaude(posts, env.ANTHROPIC_API_KEY, targetDate);

    // Save to database
    await saveIdeasToDB(ideas, env.IDEAS_DB);

    return new Response(
      JSON.stringify({ success: true, count: ideas.length }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
};
