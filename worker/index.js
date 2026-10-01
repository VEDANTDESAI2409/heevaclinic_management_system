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

// In-memory request and duplicate tracking per worker isolate
const requestHistory = new Map(); // clientKey -> array of timestamps in last 60s
const recentRequests = new Map(); // `${clientKey}:${method}:${pathname}` -> lastTimestamp

function getClientIdentifier(request) {
  return (
    request.headers.get('CF-Connecting-IP') ||
    request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim() ||
    request.headers.get('Client-IP') ||
    'anonymous-client'
  );
}

function inferDatabaseOp(method, pathname) {
  const parts = pathname.replace(/^\/api\/?/, '').split('/');
  const table = parts[0] || '';
  const sub = parts[1] || '';

  if (table === 'health') return 'HEALTH_CHECK';
  if (table === 'auth') return `AUTH_${sub.toUpperCase() || 'OP'}`;
  if (table === 'sync') return `SYNC_${sub.toUpperCase() || 'OP'}`;
  if (table === 'admin') return `ADMIN_${sub.toUpperCase() || 'OP'}`;
  if (sub === 'import' && method === 'POST') return `BULK_IMPORT_${table.toUpperCase()}`;
  if (sub === 'next-uhid' && method === 'GET') return 'PREVIEW_NEXT_UHID';

  if (method === 'GET' && sub) return `READ_ONE_${table.toUpperCase()}`;
  if (method === 'GET') return `READ_ALL_${table.toUpperCase()}`;
  if (method === 'POST') return `CREATE_${table.toUpperCase()}`;
  if (method === 'PUT') return `UPDATE_${table.toUpperCase()}`;
  if (method === 'DELETE') return `DELETE_${table.toUpperCase()}`;
  return `${method}_${table.toUpperCase()}`;
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

    // 2. Handle /api/* requests (Dynamic clinic data with structured logging & rate protection)
    if (pathname.startsWith('/api')) {
      const startTime = Date.now();
      const client = getClientIdentifier(request);
      const method = request.method;
      const op = inferDatabaseOp(method, pathname);

      // Track request frequency (60s sliding window)
      const now = Date.now();
      const clientTimestamps = requestHistory.get(client) || [];
      const recentWindow = clientTimestamps.filter((t) => now - t < 60000);
      recentWindow.push(now);
      requestHistory.set(client, recentWindow);
      const reqFreqPerMin = recentWindow.length;

      // Detect duplicate rapid requests from same client (within 800ms)
      const reqKey = `${client}:${method}:${pathname}`;
      const lastReqTime = recentRequests.get(reqKey);
      const isDuplicate = lastReqTime && now - lastReqTime < 800;
      recentRequests.set(reqKey, now);

      // Cleanup stale map entries periodically
      if (recentRequests.size > 1000) {
        for (const [k, ts] of recentRequests.entries()) {
          if (now - ts > 10000) recentRequests.delete(k);
        }
      }
      if (requestHistory.size > 500) {
        for (const [c, tsArr] of requestHistory.entries()) {
          if (tsArr.length === 0 || now - tsArr[tsArr.length - 1] > 60000) requestHistory.delete(c);
        }
      }

      // Backend safety rate limiter ceiling (240 requests/min per client)
      if (reqFreqPerMin > 240) {
        console.warn(`[API 429 RATE LIMIT] Throttling ${client} on ${method} ${pathname} (${reqFreqPerMin} reqs/min)`);
        const retryAfter = 5;
        const rateLimitResponse = Response.json(
          {
            error: 'Server is currently handling high traffic. Please wait a moment.',
            retryAfter,
          },
          {
            status: 429,
            headers: {
              ...corsHeaders,
              'Retry-After': String(retryAfter),
            },
          }
        );
        return addApiHeaders(rateLimitResponse);
      }

      try {
        const response = await routeApi(request, env, pathname);
        const duration = Date.now() - startTime;
        const dupWarning = isDuplicate ? ' | ⚠️ RAPID DUPLICATE DETECTED' : '';
        console.log(
          `[API LOG] ${new Date(now).toISOString()} | ${method} ${pathname} | Status: ${response.status} | Op: ${op} | Time: ${duration}ms | Freq: ${reqFreqPerMin}/min${dupWarning}`
        );
        return addApiHeaders(response);
      } catch (err) {
        const duration = Date.now() - startTime;
        console.error(`[API LOG ERROR] ${new Date(now).toISOString()} | ${method} ${pathname} | Op: ${op} | Time: ${duration}ms | Error:`, err?.message || err);
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
