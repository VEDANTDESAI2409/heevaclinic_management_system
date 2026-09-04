import { routeApi } from './router.js';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

const apiHeaders = {
  ...corsHeaders,
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
  'Pragma': 'no-cache',
  'Expires': '0',
};

function addApiHeaders(response) {
  const newHeaders = new Headers(response.headers);
  for (const [key, value] of Object.entries(apiHeaders)) {
    newHeaders.set(key, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders,
  });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const pathname = url.pathname;

    // 1. Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: corsHeaders,
      });
    }

    // 2. Handle /api/* requests (Dynamic clinic data - always no-cache)
    if (pathname.startsWith('/api')) {
      try {
        const response = await routeApi(request, env, pathname);
        return addApiHeaders(response);
      } catch (err) {
        console.error('[Worker Fatal Error]', err);
        return addApiHeaders(
          Response.json(
            { error: err.message || 'Internal Server Error' },
            { status: 500 }
          )
        );
      }
    }

    // 3. Fallback to Cloudflare Static Assets (dist/) if configured
    if (env.ASSETS) {
      try {
        const assetResponse = await env.ASSETS.fetch(request);
        if (assetResponse.status !== 404) {
          return assetResponse;
        }
        // SPA Fallback for client-side routing
        const indexRequest = new Request(new URL('/index.html', request.url), request);
        return await env.ASSETS.fetch(indexRequest);
      } catch (_) {
        // Continue to 404
      }
    }

    return new Response('Not Found', { status: 404 });
  },
};
