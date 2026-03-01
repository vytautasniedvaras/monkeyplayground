/**
 * GET /api/live
 * Lists all Cloudflare Stream live inputs with status and playback URLs.
 * The list endpoint returns minimal data, so we fetch each input individually in parallel.
 */
export async function handleLiveInputs(request, env, respond) {
  if (!env.CF_ACCOUNT_ID || !env.CF_STREAM_TOKEN) {
    return respond(
      JSON.stringify({ error: 'CF_ACCOUNT_ID / CF_STREAM_TOKEN secrets not set' }),
      500
    );
  }

  const base = `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/stream/live_inputs`;
  const headers = { Authorization: `Bearer ${env.CF_STREAM_TOKEN}` };

  // 1. Get list of IDs
  const listResp = await fetch(base, { headers });
  if (!listResp.ok) {
    return respond(JSON.stringify({ error: `CF API error ${listResp.status}` }), 502);
  }
  const listData = await listResp.json();
  const ids = (listData.result ?? []).map((i) => i.uid);

  // 2. Fetch full detail for each in parallel
  const details = await Promise.all(
    ids.map((id) =>
      fetch(`${base}/${id}`, { headers })
        .then((r) => r.json())
        .then((d) => d.result)
        .catch(() => null)
    )
  );

  const streams = details.filter(Boolean).map((input) => ({
    id:        input.uid,
    name:      input.meta?.name ?? input.uid,
    connected: input.status?.current?.state === 'connected',
    protocol:  input.status?.current?.ingestProtocol ?? null,
    whepUrl:   input.webRTCPlayback?.url ?? null,
    hlsUrl:    input.webRTCPlayback?.url
                 ? input.webRTCPlayback.url.replace('/webRTC/play', '/manifest/video.m3u8')
                 : null,
  }));

  return respond(JSON.stringify({ streams }), 200);
}
