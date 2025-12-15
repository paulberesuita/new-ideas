const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export const onRequestOptions = async () => {
  return new Response(null, { headers: corsHeaders });
};

export const onRequestDelete = async (context: any) => {
  const { params, env } = context;
  const date = params.date;

  try {
    if (!date) {
      return new Response(
        JSON.stringify({ success: false, error: 'Date parameter is required' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Delete all ideas for the specified date
    const result = await env.IDEAS_DB.prepare(`
      DELETE FROM ideas WHERE date = ?
    `)
      .bind(date)
      .run();

    return new Response(
      JSON.stringify({ 
        success: true, 
        deleted: result.meta.changes || 0 
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

