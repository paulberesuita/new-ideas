const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export const onRequestOptions = async () => {
  return new Response(null, { headers: corsHeaders });
};

export const onRequestGet = async (context: any) => {
  const { request, env } = context;
  const url = new URL(request.url);

  try {
    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = parseInt(url.searchParams.get('limit') || '10');
    const offset = (page - 1) * limit;

    const { results } = await env.IDEAS_DB.prepare(`
      SELECT * FROM ideas
      ORDER BY date DESC, created_at DESC
      LIMIT ? OFFSET ?
    `)
      .bind(limit, offset)
      .all();

    // Group by date
    const grouped: Record<string, any[]> = {};
    for (const idea of results as any[]) {
      if (!grouped[idea.date]) {
        grouped[idea.date] = [];
      }
      grouped[idea.date].push(idea);
    }

    // Check if there are more results
    const { results: countResults } = await env.IDEAS_DB.prepare(`
      SELECT COUNT(*) as total FROM ideas
    `).first();

    const total = (countResults as any)?.total || 0;
    const hasMore = offset + limit < total;

    return new Response(
      JSON.stringify({
        ideas: grouped,
        hasMore,
        page,
      }),
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
