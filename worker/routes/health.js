export async function handleHealth(_req, env) {
  try {
    // Probe database connectivity with a lightweight query
    await env.DB.prepare('SELECT 1').first();
    return Response.json(
      { status: 'ok', storage: 'd1', backend: 'connected' },
      { status: 200 }
    );
  } catch (error) {
    return Response.json(
      { status: 'error', storage: 'd1', backend: 'disconnected', error: error.message },
      { status: 500 }
    );
  }
}
