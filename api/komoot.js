// The club's Komoot collections, slimmed down and cached at Vercel's edge: visitors load
// a few KB once instead of each fetching Komoot's full data for every collection.
// GET /api/komoot?ids=4776834,4780379 → { collections: { "4776834": [rides] | null } }
import { loadCollection } from '../src/scripts/komoot.js';

export default async function handler(req, res) {
  const ids = String(new URL(req.url, 'http://localhost').searchParams.get('ids') ?? '')
    .split(',')
    .filter((id) => /^\d{1,12}$/.test(id))
    .slice(0, 20);
  const entries = await Promise.all(ids.map(async (id) => {
    try {
      return [id, await loadCollection(id, (url) => fetch(url, { signal: AbortSignal.timeout(8000) }))];
    } catch (e) {
      console.error('komoot:', e.message);
      return [id, null];
    }
  }));
  const failed = entries.some(([, rides]) => rides === null);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  // Changes on Komoot show up within ten minutes; a failure is retried after one.
  res.setHeader('Cache-Control', failed ? 'public, s-maxage=60' : 'public, s-maxage=600, stale-while-revalidate=86400');
  res.end(JSON.stringify({ collections: Object.fromEntries(entries) }));
}
