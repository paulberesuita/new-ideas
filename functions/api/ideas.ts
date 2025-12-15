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
    const filterDate = url.searchParams.get('date'); // Optional: filter by specific date

    let results;
    if (filterDate) {
      // Fetch ideas for a specific date
      const query = await env.IDEAS_DB.prepare(`
        SELECT * FROM ideas
        WHERE date = ?
        ORDER BY created_at DESC
      `).bind(filterDate).all();
      results = query.results;
    } else {
      // Fetch all ideas (for backwards compatibility)
      const page = parseInt(url.searchParams.get('page') || '1');
      const limit = parseInt(url.searchParams.get('limit') || '30');
      const offset = (page - 1) * limit;

      const query = await env.IDEAS_DB.prepare(`
        SELECT * FROM ideas
        ORDER BY date DESC, created_at DESC
        LIMIT ? OFFSET ?
      `).bind(limit, offset).all();
      results = query.results;
    }

    // Group by date
    const grouped: Record<string, any[]> = {};
    for (const idea of results as any[]) {
      if (!grouped[idea.date]) {
        grouped[idea.date] = [];
      }
      grouped[idea.date].push(idea);
    }

    // Check if there are more results (only relevant when not filtering by date)
    let hasMore = false;
    let page = 1;
    if (!filterDate) {
      page = parseInt(url.searchParams.get('page') || '1');
      const limit = parseInt(url.searchParams.get('limit') || '30');
      const offset = (page - 1) * limit;

      const countResult = await env.IDEAS_DB.prepare(`
        SELECT COUNT(*) as total FROM ideas
      `).first();

      const total = (countResult as any)?.total || 0;
      hasMore = offset + limit < total;
    }

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
