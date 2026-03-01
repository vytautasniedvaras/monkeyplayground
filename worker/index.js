import { handleLiveInputs } from './routes/liveInputs.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function json(body, status = 200) {
  return new Response(body, {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS });
    }

    const { pathname } = new URL(request.url);

    try {
      if (pathname === '/api/live') return handleLiveInputs(request, env, json);
      return json(JSON.stringify({ error: 'Not found' }), 404);
    } catch (err) {
      console.error('Worker error:', err);
      return json(JSON.stringify({ error: 'Internal server error' }), 500);
    }
  },
};
