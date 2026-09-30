import { d1Client } from '../db/d1Client.js';

const noCacheHeaders = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
  'Pragma': 'no-cache',
  'Expires': '0',
};

export async function handleSyncStatus(request, env) {
  try {
    const status = await d1Client.getDbVersion(env.DB);
    return Response.json(
      { ok: true, version: status.version, updatedAt: status.updatedAt },
      { status: 200, headers: noCacheHeaders }
    );
  } catch (error) {
    console.error('[Worker Sync API] Error getting sync status:', error);
    return Response.json(
      { error: error.message || 'Operation failed' },
      { status: 500, headers: noCacheHeaders }
    );
  }
}

export async function handleSyncBundle(request, env) {
  try {
    const bundle = await d1Client.getSyncBundle(env.DB);
    return Response.json(bundle, { status: 200, headers: noCacheHeaders });
  } catch (error) {
    console.error('[Worker Sync API] Error getting sync bundle:', error);
    return Response.json(
      { error: error.message || 'Operation failed' },
      { status: 500, headers: noCacheHeaders }
    );
  }
}
