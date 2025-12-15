const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export const onRequestOptions = async () => {
  return new Response(null, { headers: corsHeaders });
};

export const onRequestGet = async (context: any) => {
  const { env } = context;

  try {
    const { results } = await env.IDEAS_DB.prepare(`
      SELECT DISTINCT date FROM ideas ORDER BY date DESC
    `).all();

    const dates = (results as any[]).map((r) => r.date);

    return new Response(
      JSON.stringify({ dates }),
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
