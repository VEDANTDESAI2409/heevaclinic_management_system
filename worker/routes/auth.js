import { verifyPassword, createAuthToken, verifyAuthToken } from '../auth.js';

export async function handleLogin(request, env) {
  if (request.method !== 'POST') {
    return Response.json({ ok: false, error: 'Method Not Allowed' }, { status: 405 });
  }

  let body;
  try {
    body = await request.json();
  } catch (_) {
    return Response.json({ ok: false, error: 'Invalid JSON request body' }, { status: 400 });
  }

  const { password } = body || {};
  if (!password || typeof password !== 'string') {
    return Response.json({ ok: false, error: 'Clinic password is required.' }, { status: 400 });
  }

  const isValid = verifyPassword(password, env);
  if (!isValid) {
    return Response.json({ ok: false, error: 'Incorrect clinic password. Please try again.' }, { status: 401 });
  }

  const tokenData = await createAuthToken(env);
  return Response.json({
    ok: true,
    message: 'Authentication successful',
    token: tokenData.token,
    expiresAt: tokenData.expiresAt,
  });
}

export async function handleVerify(request, env) {
  const authHeader = request.headers.get('Authorization');
  const isValid = await verifyAuthToken(authHeader, env);

  if (!isValid) {
    return Response.json({ ok: false, error: 'Invalid or expired session token.' }, { status: 401 });
  }

  return Response.json({ ok: true, valid: true });
}

export async function handleLogout() {
  return Response.json({ ok: true, message: 'Logged out successfully' });
}
