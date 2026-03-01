/**
 * GET /api/streams/:id/status
 *
 * Proxies a live status check for a Cloudflare Stream video.
 * Requires CF_ACCOUNT_ID and CF_STREAM_TOKEN secrets in the Worker environment.
 *
 * Returns: { id, status: 'live'|'ready'|'error'|'unknown', details }
 */
export async function handleStatus(request, env, ctx, id, respond) {
  // Fetch the stream record
  const raw = await env.STREAMS_KV.get(`stream:${id}`);
  if (!raw) {
    return respond(JSON.stringify({ error: 'Stream not found' }), 404);
  }

  const stream = JSON.parse(raw);

  // If no Cloudflare Stream ID is stored, we can only do a basic HLS probe
  if (!stream.streamId) {
    const alive = await probeHls(stream.hlsUrl);
    return respond(JSON.stringify({ id, status: alive ? 'live' : 'unknown' }), 200);
  }

  // Cloudflare Stream API check
  if (!env.CF_ACCOUNT_ID || !env.CF_STREAM_TOKEN) {
    return respond(
      JSON.stringify({ id, status: 'unknown', note: 'CF credentials not configured' }),
      200
    );
  }

  try {
    const cfUrl = `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/stream/${stream.streamId}`;
    const cfResp = await fetch(cfUrl, {
      headers: {
        Authorization: `Bearer ${env.CF_STREAM_TOKEN}`,
      },
    });

    if (!cfResp.ok) {
      return respond(JSON.stringify({ id, status: 'error', details: `CF API ${cfResp.status}` }), 200);
    }

    const cfData = await cfResp.json();
    const cfStatus = cfData?.result?.status?.state ?? 'unknown';

    // Cloudflare states: inprogress, ready, error, pendingupload
    const status =
      cfStatus === 'ready' ? 'live' :
      cfStatus === 'inprogress' ? 'live' :
      cfStatus === 'error' ? 'error' : 'offline';

    return respond(JSON.stringify({ id, status, cfStatus }), 200);
  } catch (err) {
    return respond(JSON.stringify({ id, status: 'error', details: err.message }), 200);
  }
}

/**
 * Lightweight HLS probe — just HEAD the .m3u8 URL.
 */
async function probeHls(hlsUrl) {
  try {
    const resp = await fetch(hlsUrl, { method: 'HEAD', cf: { cacheTtl: 0 } });
    return resp.ok;
  } catch {
    return false;
  }
}
