/**
 * GET  /api/streams  — return all streams
 * POST /api/streams  — submit a new stream
 */
export async function handleStreams(request, env, respond) {
  const method = request.method.toUpperCase();

  if (method === 'GET') {
    return getStreams(env, respond);
  }

  if (method === 'POST') {
    return postStream(request, env, respond);
  }

  return respond(JSON.stringify({ error: 'Method not allowed' }), 405);
}

async function getStreams(env, respond) {
  const indexRaw = await env.STREAMS_KV.get('index');
  const ids = indexRaw ? JSON.parse(indexRaw) : [];

  const streamPromises = ids.map((id) => env.STREAMS_KV.get(`stream:${id}`));
  const rawStreams = await Promise.all(streamPromises);

  const streams = rawStreams
    .filter(Boolean)
    .map((s) => JSON.parse(s));

  return respond(JSON.stringify({ streams }), 200);
}

async function postStream(request, env, respond) {
  let body;
  try {
    body = await request.json();
  } catch {
    return respond(JSON.stringify({ error: 'Invalid JSON' }), 400);
  }

  const { artistName, hlsUrl, streamId } = body;

  if (!artistName || typeof artistName !== 'string' || artistName.trim().length === 0) {
    return respond(JSON.stringify({ error: 'artistName is required' }), 400);
  }

  if (!hlsUrl || typeof hlsUrl !== 'string' || !hlsUrl.startsWith('http')) {
    return respond(JSON.stringify({ error: 'hlsUrl must be a valid URL' }), 400);
  }

  // Dedup: return existing entry if same hlsUrl already registered
  const indexRaw2 = await env.STREAMS_KV.get('index');
  const existingIds = indexRaw2 ? JSON.parse(indexRaw2) : [];
  const existingRaw = await Promise.all(existingIds.map((id) => env.STREAMS_KV.get(`stream:${id}`)));
  const existing = existingRaw.filter(Boolean).map((s) => JSON.parse(s));
  const duplicate = existing.find((s) => s.hlsUrl === hlsUrl.trim());
  if (duplicate) {
    return respond(JSON.stringify({ stream: duplicate, duplicate: true }), 200);
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  const streamObj = {
    id,
    hlsUrl: hlsUrl.trim(),
    streamId: streamId ?? null,
    artistName: artistName.trim().slice(0, 64),
    submittedAt: now,
    active: true,
  };

  // Update index
  const indexRaw = await env.STREAMS_KV.get('index');
  const ids = indexRaw ? JSON.parse(indexRaw) : [];
  ids.push(id);

  await Promise.all([
    env.STREAMS_KV.put(`stream:${id}`, JSON.stringify(streamObj)),
    env.STREAMS_KV.put('index', JSON.stringify(ids)),
  ]);

  return respond(JSON.stringify({ stream: streamObj }), 201);
}
