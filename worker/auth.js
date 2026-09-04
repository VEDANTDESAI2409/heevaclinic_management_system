// Cloudflare Worker Authentication utilities for HEEVA CLINIC
// Uses Web Crypto API (supported in Cloudflare Workers and Node 18+)

const DEFAULT_DEV_PASSWORD = 'heeva123';
const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function base64UrlEncode(bufferOrStr) {
  let binary = '';
  if (typeof bufferOrStr === 'string') {
    binary = bufferOrStr;
  } else {
    const bytes = new Uint8Array(bufferOrStr);
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(str) {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  return atob(base64);
}

async function getHmacKey(secretStr) {
  const enc = new TextEncoder();
  return crypto.subtle.importKey(
    'raw',
    enc.encode(secretStr),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

export function getConfiguredPassword(env) {
  return (env && env.APP_PASSWORD) ? String(env.APP_PASSWORD) : DEFAULT_DEV_PASSWORD;
}

export function verifyPassword(inputPassword, env) {
  if (inputPassword == null || typeof inputPassword !== 'string') {
    return false;
  }
  const configured = getConfiguredPassword(env);
  const enc = new TextEncoder();
  const a = enc.encode(inputPassword);
  const b = enc.encode(configured);

  if (a.byteLength !== b.byteLength) {
    return false;
  }

  // Constant-time byte comparison
  let diff = 0;
  for (let i = 0; i < a.byteLength; i++) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}

export async function createAuthToken(env) {
  const secret = (env && (env.AUTH_SECRET || env.APP_PASSWORD)) || DEFAULT_DEV_PASSWORD;
  const key = await getHmacKey(secret);
  const now = Date.now();
  const payload = {
    role: 'admin',
    iat: now,
    exp: now + TOKEN_TTL_MS,
  };

  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const enc = new TextEncoder();
  const sigBuffer = await crypto.subtle.sign('HMAC', key, enc.encode(encodedPayload));
  const encodedSig = base64UrlEncode(sigBuffer);

  return {
    token: `${encodedPayload}.${encodedSig}`,
    expiresAt: payload.exp,
  };
}

export async function verifyAuthToken(authHeader, env) {
  if (!authHeader || typeof authHeader !== 'string') {
    return false;
  }

  const parts = authHeader.trim().split(' ');
  if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') {
    return false;
  }

  const token = parts[1];
  const tokenParts = token.split('.');
  if (tokenParts.length !== 2) {
    return false;
  }

  const [encodedPayload, encodedSig] = tokenParts;
  try {
    const secret = (env && (env.AUTH_SECRET || env.APP_PASSWORD)) || DEFAULT_DEV_PASSWORD;
    const key = await getHmacKey(secret);
    const enc = new TextEncoder();

    // Decode signature
    const sigBinary = base64UrlDecode(encodedSig);
    const sigBytes = new Uint8Array(sigBinary.length);
    for (let i = 0; i < sigBinary.length; i++) {
      sigBytes[i] = sigBinary.charCodeAt(i);
    }

    const isValidSig = await crypto.subtle.verify(
      'HMAC',
      key,
      sigBytes,
      enc.encode(encodedPayload)
    );

    if (!isValidSig) {
      return false;
    }

    const payloadJson = base64UrlDecode(encodedPayload);
    const payload = JSON.parse(payloadJson);

    if (!payload.exp || typeof payload.exp !== 'number') {
      return false;
    }

    if (Date.now() > payload.exp) {
      return false;
    }

    return true;
  } catch (err) {
    return false;
  }
}
