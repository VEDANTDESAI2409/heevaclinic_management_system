import { handleHealth } from './routes/health.js';
import {
  handleGetAll,
  handleGetById,
  handleCreate,
  handleUpdate,
  handleDelete,
} from './routes/genericCrud.js';
import { handleBulkImport } from './routes/import.js';
import { verifyAuthToken } from './auth.js';
import { handleLogin, handleVerify, handleLogout } from './routes/auth.js';
import { handleReset } from './routes/reset.js';

export async function routeApi(request, env, pathname) {
  const method = request.method;

  // 1. Healthcheck: /api/health (Public)
  if (pathname === '/api/health' && method === 'GET') {
    return handleHealth(request, env);
  }

  // 2. Auth endpoints (Public)
  if (pathname === '/api/auth/login' && method === 'POST') {
    return handleLogin(request, env);
  }
  if (pathname === '/api/auth/verify') {
    return handleVerify(request, env);
  }
  if (pathname === '/api/auth/logout') {
    return handleLogout(request, env);
  }

  // 3. Auth Guard for all remaining /api/* endpoints
  const authHeader = request.headers.get('Authorization');
  const isAuthorized = await verifyAuthToken(authHeader, env);
  if (!isAuthorized) {
    return Response.json(
      { ok: false, error: 'Unauthorized. Invalid or expired session token.' },
      { status: 401 }
    );
  }

  // 4. Admin Database Reset: POST /api/admin/reset
  if (pathname === '/api/admin/reset' && method === 'POST') {
    return handleReset(request, env);
  }

  // Parse segments after /api/
  const subPath = pathname.replace(/^\/api\/?/, '');
  const segments = subPath ? subPath.split('/').map(decodeURIComponent) : [];

  if (segments.length === 0) {
    return Response.json(
      { error: `API route not found: ${method} ${pathname}` },
      { status: 404 }
    );
  }

  const table = segments[0];

  // 5. Bulk Import: POST /api/:table/import
  if (segments.length === 2 && segments[1] === 'import' && method === 'POST') {
    const body = await request.json().catch(() => ({}));
    return handleBulkImport(table, body, env);
  }

  // 6. Collection Root: /api/:table
  if (segments.length === 1) {
    if (method === 'GET') {
      return handleGetAll(table, env);
    }
    if (method === 'POST') {
      const body = await request.json().catch(() => ({}));
      return handleCreate(table, body, env);
    }
  }

  // 7. Record by ID: /api/:table/:id
  if (segments.length === 2) {
    const id = segments[1];
    if (method === 'GET') {
      return handleGetById(table, id, env);
    }
    if (method === 'PUT') {
      const body = await request.json().catch(() => ({}));
      return handleUpdate(table, id, body, env);
    }
    if (method === 'DELETE') {
      return handleDelete(table, id, env);
    }
  }

  // Fallback 404 for unhandled API endpoints
  return Response.json(
    { error: `API route not found: ${method} ${pathname}` },
    { status: 404 }
  );
}
