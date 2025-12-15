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
  ph_url: string;
  ph_upvotes: number;
  ph_image?: string;
  mini_ideas: string[];
}

async function fetchProductHuntLaunches(apiToken?: string, daysBack: number = 0): Promise<ProductHuntPost[]> {
  // Fetch top posts (Product Hunt API doesn't support date filtering well, so we get top posts)
  const query = `
    query {
      posts(first: ${3 * (daysBack + 1)}, order: VOTES) {
        edges {
          node {
            id
            name
            tagline
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
  apiKey: string
): Promise<Idea[]> {
  const products = posts.map((p) => ({
    name: p.node.name,
    tagline: p.node.tagline,
    url: p.node.url,
    upvotes: p.node.votesCount,
    image: p.node.thumbnail?.url || null,
  }));

  const prompt = `Analyze these top 3 Product Hunt launches and generate 2 simplified build ideas for each product. For each product, provide 2 different mini_ideas - simplified versions that could be built.

Products:
${products.map((p, i) => `${i + 1}. ${p.name} - ${p.tagline} (${p.upvotes} upvotes)`).join('\n')}

Return a JSON array with this structure for each product:
[
  {
    "mini_ideas": ["first simplified idea", "second simplified idea"]
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
      model: 'claude-3-opus-20240229',
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
  const jsonMatch = content.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    throw new Error('Could not parse Claude response as JSON');
  }

  const ideas = JSON.parse(jsonMatch[0]);

  // Combine with Product Hunt data
  // For past days, we'll assign dates going backwards
  const today = new Date();
  const result: Idea[] = [];
  
  // Group products into chunks of 3 (one per day)
  const productsPerDay = 3;
  for (let dayOffset = 0; dayOffset <= daysBack; dayOffset++) {
    const targetDate = new Date(today);
    targetDate.setDate(targetDate.getDate() - dayOffset);
    const dateStr = targetDate.toISOString().split('T')[0];
    
    const startIdx = dayOffset * productsPerDay;
    const endIdx = startIdx + productsPerDay;
    const dayProducts = products.slice(startIdx, endIdx);
    const dayIdeas = ideas.slice(startIdx, endIdx);
    
    dayProducts.forEach((product, idx) => {
      if (product && dayIdeas[idx]) {
        result.push({
          date: dateStr,
          ph_name: product.name,
          ph_tagline: product.tagline,
          ph_url: product.url,
          ph_upvotes: product.upvotes,
          ph_image: product.image || null,
          mini_ideas: dayIdeas[idx].mini_ideas || [],
        });
      }
    });
  }
  
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
        idea.ph_tagline,
        idea.ph_url,
        idea.ph_upvotes,
        idea.ph_image || null,
        miniIdeasJson
      )
      .run();
  }
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
  const daysBack = parseInt(url.searchParams.get('daysBack') || '0');

  try {
    // Fetch Product Hunt launches (default: today only, but can fetch past days)
    const posts = await fetchProductHuntLaunches(env.PRODUCT_HUNT_API_TOKEN, daysBack);

    // Generate ideas with Claude
    if (!env.ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY not configured');
    }
    const ideas = await generateIdeasWithClaude(posts, env.ANTHROPIC_API_KEY);

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
