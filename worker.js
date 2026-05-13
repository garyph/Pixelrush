/**
 * Scan & Cook — Cloudflare Worker
 * ─────────────────────────────────────────────────────────────────
 * Required environment secrets (set in Cloudflare dashboard):
 *   ANTHROPIC_API_KEY  — your Anthropic API key
 *
 * Optional KV namespace (for legacy leaderboard endpoints):
 *   PIXELDASH_KV
 *
 * Endpoints:
 *   POST /api/parse-recipe   → { recipe } — AI vision recipe parser
 *   GET  /api/board          → leaderboard (legacy)
 *   POST /api/score          → submit score (legacy)
 *   POST /api/played         → increment counter (legacy)
 */

/* ── CORS ──────────────────────────────────────────────────────── */
const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}

function err(msg, status = 400) {
  return json({ error: msg }, status);
}

/* ── Recipe parse prompt ───────────────────────────────────────── */
const RECIPE_PROMPT = `You are parsing a HelloFresh recipe card photo.

Return ONLY a raw JSON object — no markdown, no code fences, no explanation.

{
  "name": "Recipe Name",
  "tagline": "Short subtitle e.g. 'with Herb Rice & Lemon'",
  "servings": "2",
  "totalTime": "45 min",
  "ingredients": [
    { "emoji": "🥩", "name": "Ingredient name" }
  ],
  "steps": [
    {
      "name": "Step name",
      "emoji": "🔪",
      "bg": "#e8f5e9",
      "time": "5-10 min",
      "tip": "A practical cooking tip",
      "tasks": [
        "Clear single-action task",
        "Another task"
      ]
    }
  ]
}

Rules:
- Include every step visible on the card
- Break each step into 4-8 individual, single-action tasks
  (split compound sentences into separate items)
- Choose a fitting emoji and soft pastel hex background color per step
- "time" is a string like "15-18 min", or null if not stated
- "tip" is a brief, practical culinary tip from your own knowledge
- For ingredients, choose fitting food emojis`;

/* ── Worker entry ──────────────────────────────────────────────── */
export default {
  async fetch(req, env) {
    const { method } = req;
    const { pathname } = new URL(req.url);

    if (method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS });
    }

    /* ── POST /api/parse-recipe ─────────────────────────────────── */
    if (method === 'POST' && pathname === '/api/parse-recipe') {
      let body;
      try { body = await req.json(); } catch { return err('Invalid JSON'); }

      const { image, mimeType = 'image/jpeg' } = body;
      if (!image)          return err('image is required');
      if (image.length > 6_000_000) return err('Image too large — please use a smaller photo');

      const apiKey = env.ANTHROPIC_API_KEY;
      if (!apiKey) return err('Server not configured (missing ANTHROPIC_API_KEY)', 503);

      let aiRes;
      try {
        aiRes = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type':    'application/json',
            'x-api-key':       apiKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model:      'claude-haiku-4-5-20251001',
            max_tokens: 3000,
            messages: [{
              role: 'user',
              content: [
                {
                  type:   'image',
                  source: { type: 'base64', media_type: mimeType, data: image },
                },
                { type: 'text', text: RECIPE_PROMPT },
              ],
            }],
          }),
        });
      } catch (e) {
        return err('Could not reach AI service — check Worker connectivity', 502);
      }

      if (!aiRes.ok) {
        const detail = await aiRes.text().catch(() => '');
        return err(`AI error ${aiRes.status}: ${detail}`, 502);
      }

      const aiData  = await aiRes.json();
      const rawText = aiData.content?.[0]?.text ?? '';

      // Strip markdown code fences if Claude wrapped the JSON
      const cleaned = rawText
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```\s*$/, '')
        .trim();

      let recipe;
      try {
        // Be forgiving: find the first { … } block in case of extra text
        const match = cleaned.match(/\{[\s\S]*\}/);
        recipe = JSON.parse(match ? match[0] : cleaned);
      } catch {
        return err('Could not parse recipe from this image — try a clearer photo', 422);
      }

      if (!Array.isArray(recipe.steps) || recipe.steps.length === 0) {
        return err('No recipe steps found — try a clearer photo of the recipe card', 422);
      }

      return json({ recipe });
    }

    /* ── Legacy leaderboard endpoints ──────────────────────────── */
    const KV = env.PIXELDASH_KV;

    if (method === 'GET' && pathname === '/api/board') {
      if (!KV) return json({ scores: [], gamesPlayed: 0 });
      const [raw, played] = await Promise.all([
        KV.get('scores_v1', { type: 'json' }),
        KV.get('games_played'),
      ]);
      return json({ scores: Array.isArray(raw) ? raw : [], gamesPlayed: parseInt(played || '0') });
    }

    if (method === 'POST' && pathname === '/api/played') {
      if (!KV) return json({ gamesPlayed: 0 });
      const cur = parseInt(await KV.get('games_played') || '0');
      await KV.put('games_played', String(cur + 1));
      return json({ gamesPlayed: cur + 1 });
    }

    if (method === 'POST' && pathname === '/api/score') {
      if (!KV) return err('Leaderboard not available', 503);
      let body;
      try { body = await req.json(); } catch { return err('Invalid JSON'); }
      const name  = String(body.name || '').trim().replace(/[^A-Za-z0-9_.'-]/g, '').slice(0, 7).toUpperCase();
      const score = parseInt(body.score);
      if (!name)                        return err('Name required');
      if (isNaN(score) || score < 0)    return err('Invalid score');
      const entry    = { name, score, date: new Date().toISOString().slice(0, 10) };
      const existing = (await KV.get('scores_v1', { type: 'json' })) || [];
      const merged   = [...existing, entry].sort((a, b) => b.score - a.score).slice(0, 10);
      await KV.put('scores_v1', JSON.stringify(merged));
      return json({ ok: true, rank: merged.findIndex(e => e.name === name && e.score === score) + 1, board: merged });
    }

    return err('Not found', 404);
  },
};
