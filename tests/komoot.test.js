// Run with `npm test`. The Komoot reader and its cached endpoint, with Komoot faked.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/komoot.js';
import { collectionId, nextRide, ridesFrom } from '../src/scripts/komoot.js';

const tour = (id, name, extra = {}) => ({
  type: 'tour_planned', status: 'public', id, name, distance: 52400, elevation_up: 548.4,
  map_image: { src: `https://tourpic.example/${id}/?width={width}&height={height}&crop={crop}` }, ...extra,
});

test('two groups on one day become one ride with both groups', () => {
  const [ride] = ridesFrom([tour(1, '7. März: Bösingen - Wünnewil Sportivo'), tour(2, '7. März: Bösingen-Wünnewil Veloce')]);
  assert.deepEqual([ride.day, ride.month, ride.place], [7, 3, 'Bösingen - Wünnewil']);
  assert.deepEqual(ride.groups.map((g) => [g.name, g.km, g.hm, g.url]), [
    ['Sportivo', 52, 548, 'https://www.komoot.com/tour/1'],
    ['Veloce', 52, 548, 'https://www.komoot.com/tour/2'],
  ]);
  assert.equal(ride.groups[0].map, 'https://tourpic.example/1/?width=640&height=400&crop=true');
});

test('rides are sorted by date, undated tours come last as they are', () => {
  const rides = ridesFrom([tour(1, 'Casa bei nass'), tour(2, '21. März: Frienisberg'), tour(3, '7. märz: Seftigen')]);
  assert.deepEqual(rides.map((r) => [r.day, r.month, r.place]), [[7, 3, 'Seftigen'], [21, 3, 'Frienisberg'], [0, 0, 'Casa bei nass']]);
  assert.equal(rides[0].groups[0].name, '');
});

test('private tours, highlights and impossible dates stay out or undated', () => {
  const rides = ridesFrom([tour(1, '7. März: A', { status: 'private' }), tour(2, 'Gipfel', { type: 'highlight' }), tour(3, '40. März: B'), tour(4, '3. Brumaire: C')]);
  assert.deepEqual(rides.map((r) => [r.month, r.place]), [[0, '40. März: B'], [0, '3. Brumaire: C']]);
});

test('same group name twice keeps the full names', () => {
  const [ride] = ridesFrom([tour(1, '4. Mai: Gurnigel Sportivo'), tour(2, '4. Mai: Thun Sportivo')]);
  assert.deepEqual(ride.groups.map((g) => g.name), ['Gurnigel Sportivo', 'Thun Sportivo']);
});

test('the next ride wraps into next year once the season is over', () => {
  const march = ridesFrom([tour(1, '7. März: A'), tour(2, '14. März: B')]);
  const june = ridesFrom([tour(3, '6. Juni: C')]);
  assert.equal(nextRide({ a: march, b: june }, new Date(2026, 10, 6)).place, 'A');
  assert.equal(nextRide({ a: march, b: june }, new Date(2026, 2, 8)).place, 'B');
  assert.equal(nextRide({ a: march, b: june }, new Date(2026, 2, 14)).place, 'B', 'today still counts');
  assert.equal(nextRide({ a: null, b: [] }), null);
});

test('collection ids come from any Komoot collection link', () => {
  assert.equal(collectionId('https://www.komoot.com/de-de/collection/4776834/-maerz-saisonbeginn'), '4776834');
  assert.equal(collectionId('https://www.komoot.com/collection/4780382'), '4780382');
  assert.equal(collectionId('https://www.komoot.com/tour/1'), null);
  assert.equal(collectionId('kein link'), null);
});

async function call(url) {
  const res = { headers: {}, setHeader(k, v) { this.headers[k] = v; }, end(text) { this.text = text; } };
  await handler({ url }, res);
  return { headers: res.headers, data: JSON.parse(res.text) };
}

test('the endpoint slims Komoot down and caches it', async (t) => {
  const asked = [];
  t.mock.method(globalThis, 'fetch', async (url) => {
    asked.push(url);
    if (url.includes('/666/')) return new Response('{}', { status: 500 });
    return new Response(JSON.stringify({ page: { totalPages: 1 }, _embedded: { items: [tour(9, '7. März: Seftigen', { path: 'x'.repeat(5000) })] } }));
  });
  const ok = await call('/api/komoot?ids=4776834,../../etc,4780382');
  assert.deepEqual(Object.keys(ok.data.collections), ['4776834', '4780382']);
  assert.equal(ok.data.collections['4776834'][0].place, 'Seftigen');
  assert.ok(!JSON.stringify(ok.data).includes('xxxx'), 'only what the page shows');
  assert.match(ok.headers['Cache-Control'], /s-maxage=600/);
  assert.ok(asked.every((u) => u.startsWith('https://api.komoot.de/v007/collections/')));

  const failed = await call('/api/komoot?ids=666');
  assert.equal(failed.data.collections['666'], null);
  assert.match(failed.headers['Cache-Control'], /s-maxage=60\b/);
});
