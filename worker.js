/**
 * PixelDash — Global Leaderboard Worker
 * ─────────────────────────────────────
 * Deploy to Cloudflare Workers with a KV namespace called PIXELDASH_KV
 *
 * Endpoints:
 *   GET  /api/board          → { scores:[...top10], gamesPlayed:N }
 *   POST /api/score          → submit { name, score }
 *   POST /api/played         → increment global games-played counter
 */

const KV_SCORES  = 'scores_v1';
const KV_PLAYED  = 'games_played';
const MAX_SCORES = 10;

// ── Bad word list (expand as needed) ─────────────────────────────────────────
const BAD = [
  'fuck','shit','cunt','ass','bitch','dick','cock','pussy','nigger','nigga',
  'fag','faggot','whore','slut','bastard','piss','damn','hell','sex','porn',
  'nazi','rape','kill','die','dead','nude','xxx',
];

function isBad(name) {
  const n = name.toLowerCase().replace(/[^a-z0-9]/g,'');
  return BAD.some(w => n.includes(w));
}

// ── CORS headers ──────────────────────────────────────────────────────────────
const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function ok(data)       { return new Response(JSON.stringify(data), { headers: {'Content-Type':'application/json',...CORS} }); }
function bad(msg, s=400){ return new Response(JSON.stringify({error:msg}), { status:s, headers:{'Content-Type':'application/json',...CORS} }); }

// ── Worker ───────────────────────────────────────────────────────────────────
export default {
  async fetch(req, env) {
    const { method, url } = req;
    const { pathname }    = new URL(url);

    if (method === 'OPTIONS') return new Response(null, { status:204, headers:CORS });

    // ── GET /api/board ──────────────────────────────────────────────────────
    if (method === 'GET' && pathname === '/api/board') {
      const [raw, played] = await Promise.all([
        env.PIXELDASH_KV.get(KV_SCORES, { type:'json' }),
        env.PIXELDASH_KV.get(KV_PLAYED),
      ]);
      return ok({
        scores:      Array.isArray(raw) ? raw : [],
        gamesPlayed: parseInt(played || '0'),
      });
    }

    // ── POST /api/played ────────────────────────────────────────────────────
    if (method === 'POST' && pathname === '/api/played') {
      const cur = parseInt(await env.PIXELDASH_KV.get(KV_PLAYED) || '0');
      await env.PIXELDASH_KV.put(KV_PLAYED, String(cur + 1));
      return ok({ gamesPlayed: cur + 1 });
    }

    // ── POST /api/score ─────────────────────────────────────────────────────
    if (method === 'POST' && pathname === '/api/score') {
      let body;
      try { body = await req.json(); } catch { return bad('Invalid JSON'); }

      const { name, score } = body;

      // Validate name
      const clean = String(name || '').trim().replace(/[^A-Za-z0-9_\-\.]/g,'').slice(0,7).toUpperCase();
      if (!clean || clean.length < 1) return bad('Name required (1–7 chars, letters/numbers only)');
      if (isBad(clean))               return bad('That name is not allowed');

      // Validate score
      const s = parseInt(score);
      if (isNaN(s) || s < 0 || s > 999999) return bad('Invalid score');

      const entry = {
        name:  clean,
        score: s,
        date:  new Date().toISOString().slice(0,10),
      };

      // Load existing, insert, sort, trim to top 10, save
      const existing = (await env.PIXELDASH_KV.get(KV_SCORES, { type:'json' })) || [];
      const merged   = [...existing, entry].sort((a,b) => b.score - a.score).slice(0, MAX_SCORES);
      await env.PIXELDASH_KV.put(KV_SCORES, JSON.stringify(merged));

      const rank = merged.findIndex(e => e.name === clean && e.score === s) + 1;
      return ok({ ok:true, rank, board: merged });
    }

    return bad('Not found', 404);
  },
};
