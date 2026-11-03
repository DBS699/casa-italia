// Run with `npm test`. Exercises the real handler with GitHub and Gemini faked at
// the fetch level, so login, validation and commits are covered without any keys.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/chat.js';
import { applyOperations, diffTours, TourError } from '../api/_chat-tours.js';

const TOUR = (date, title, extra = {}) => ({ date, title, img: '/assets/tours/tour-1.jpg', g1name: 'Gruppo Grappa', ...extra });
const seed = () => ({
  tours: [
    TOUR('28. Juni', 'Wohlensee', { url: 'https://www.komoot.com/de-de/tour/1', gpx: '/assets/uploads/alt.gpx' }),
    TOUR('12. Juli', 'Sigriswil'),
  ],
});

// ── fake GitHub + Gemini ──────────────────────────────────
let repo;
let geminiAnswers;
let moveHeadOnce;

const b64 = (data) => Buffer.from(JSON.stringify(data)).toString('base64');
const json = (data, status = 200) => new Response(JSON.stringify(data), { status });

function resetRepo() {
  repo = {
    commits: [{ sha: 'c0', message: 'Update Touren', parent: null, tours: seed() }],
    pending: {},
    calls: [],
  };
  geminiAnswers = [];
  moveHeadOnce = false;
}
const head = () => repo.commits[repo.commits.length - 1];

globalThis.fetch = async (url, options = {}) => {
  const u = new URL(url);
  const body = options.body ? JSON.parse(options.body) : null;
  if (u.hostname === 'generativelanguage.googleapis.com') {
    assert.equal(options.headers['x-goog-api-key'], 'gemini-key');
    repo.calls.push({ gemini: body });
    const answer = geminiAnswers.shift();
    return json({ candidates: [{ content: { parts: [{ text: typeof answer === 'string' ? answer : JSON.stringify(answer) }] } }] });
  }
  assert.equal(options.headers.Authorization, 'Bearer gh-token');
  const path = u.pathname.replace('/repos/DBS699/casa-italia', '');
  if (path === '/contents/src/data/tours.json') {
    const ref = u.searchParams.get('ref');
    const commit = ref === 'main' ? head() : repo.commits.find((c) => c.sha === ref);
    return json({ content: b64(commit.tours) });
  }
  if (path === '/git/ref/heads/main') return json({ object: { sha: head().sha } });
  if (path === '/commits') {
    const touching = [...repo.commits].reverse().filter((c) => c.touchesTours !== false);
    const c = touching[0];
    return json([{ sha: c.sha, commit: { message: c.message }, parents: c.parent ? [{ sha: c.parent }] : [] }]);
  }
  if (path.startsWith('/git/commits/')) return json({ tree: { sha: `tree-${path.split('/').pop()}` } });
  if (path === '/git/blobs') { const sha = `blob${Object.keys(repo.pending).length}`; repo.pending[sha] = body.content; return json({ sha }); }
  if (path === '/git/trees') { repo.pending.tree = body.tree; return json({ sha: 'newtree' }); }
  if (path === '/git/commits') {
    repo.pending.commit = { sha: `c${repo.commits.length}`, message: body.message, parent: body.parents[0], author: body.author };
    return json({ sha: repo.pending.commit.sha });
  }
  if (path === '/git/refs/heads/main') {
    if (moveHeadOnce) {
      moveHeadOnce = false;
      repo.commits.push({ sha: 'cms', message: 'Update Sponsoren', parent: head().sha, tours: head().tours, touchesTours: false });
      repo.pending = {};
      return json({ message: 'not a fast forward' }, 422);
    }
    assert.equal(repo.pending.commit.parent, head().sha, 'commit must build on the current head');
    const entry = repo.pending.tree.find((f) => f.path === 'src/data/tours.json');
    const tours = JSON.parse(Buffer.from(repo.pending[entry.sha], 'base64').toString('utf8'));
    repo.commits.push({ ...repo.pending.commit, tours, files: repo.pending.tree.map((f) => f.path) });
    repo.pending = {};
    return json({});
  }
  throw new Error(`unexpected fetch: ${url}`);
};

// ── calling the handler ───────────────────────────────────
async function post(body, { cookie, origin = 'https://example.ch', method = 'POST' } = {}) {
  const headers = { host: 'example.ch' };
  if (origin) headers.origin = origin;
  if (cookie) headers.cookie = cookie;
  const req = { method, headers, body };
  const res = { headers: {}, statusCode: 200, setHeader(k, v) { this.headers[k] = v; }, end(text) { this.text = text; } };
  await handler(req, res);
  return { status: res.statusCode, data: res.text ? JSON.parse(res.text) : null, cookie: res.headers['Set-Cookie'] };
}

const PASSWORD = 'ein-langes-test-passwort';
function configure() {
  process.env.CHAT_PASSWORD = PASSWORD;
  process.env.GEMINI_API_KEY = 'gemini-key';
  process.env.CHAT_GITHUB_TOKEN = 'gh-token';
}
let nextIp = 1;
async function session() {
  const r = await post({ action: 'login', password: PASSWORD });
  assert.equal(r.status, 200);
  return r.cookie.split(';')[0];
}
const say = (text) => ({ action: 'propose', messages: [{ role: 'user', text }] });

beforeEach(() => { configure(); resetRepo(); });

// ── access ────────────────────────────────────────────────
test('without keys the page learns the chat is not set up', async () => {
  delete process.env.GEMINI_API_KEY;
  const r = await post({ action: 'status' });
  assert.deepEqual(r.data, { configured: false, loggedIn: false });
});

test('a short password does not count as configured', async () => {
  process.env.CHAT_PASSWORD = 'kurz';
  assert.equal((await post({ action: 'status' })).data.configured, false);
});

test('nothing works without logging in', async () => {
  for (const action of ['propose', 'propose-undo', 'publish']) {
    const r = await post({ action, messages: [{ role: 'user', text: 'x' }] });
    assert.equal(r.status, 401, action);
  }
  assert.equal(repo.commits.length, 1);
});

test('forged and expired session cookies are rejected', async () => {
  const future = Math.floor(Date.now() / 1000) + 1000;
  assert.equal((await post({ action: 'propose-undo' }, { cookie: `vcc_chat=${future}.deadbeef` })).status, 401);
  const good = await session();
  const sig = good.split('.')[1];
  assert.equal((await post({ action: 'propose-undo' }, { cookie: `vcc_chat=${future}.${sig}` })).status, 401);
});

test('other sites cannot call the endpoint', async () => {
  const cookie = await session();
  assert.equal((await post({ action: 'publish' }, { cookie, origin: 'https://evil.example' })).status, 403);
  assert.equal((await post({ action: 'publish' }, { cookie, origin: null })).status, 403);
  assert.equal((await post({ action: 'status' }, { method: 'GET' })).status, 405);
});

test('repeated wrong passwords lock the login', async () => {
  const ip = `10.0.0.${nextIp++}`;
  const attempt = async (password) => {
    const req = { method: 'POST', headers: { host: 'example.ch', origin: 'https://example.ch', 'x-forwarded-for': ip }, body: { action: 'login', password } };
    const res = { headers: {}, setHeader() {}, end(t) { this.text = t; } };
    await handler(req, res);
    return res.statusCode;
  };
  for (let i = 0; i < 5; i += 1) assert.equal(await attempt('falsch'), 401);
  assert.equal(await attempt(PASSWORD), 429);
});

// ── proposing ─────────────────────────────────────────────
test('a question changes nothing', async () => {
  const cookie = await session();
  geminiAnswers.push({ reply: 'Am 12. Juli ist die Sigriswil-Runde.', action: 'none' });
  const r = await post(say('Was ist im Juli?'), { cookie });
  assert.equal(r.data.proposal, null);
  assert.equal(repo.commits.length, 1);
});

test('a proposal is only a preview until it is published', async () => {
  const cookie = await session();
  geminiAnswers.push({
    reply: 'Ich trage die Tour ein.',
    action: 'change',
    operations: [{ op: 'add', fields: { date: '5. Juli', title: 'Gurnigel', distance: '85 km' } }],
  });
  const r = await post(say('Neue Tour'), { cookie });
  assert.equal(r.data.proposal.changes[0].kind, 'add');
  assert.equal(repo.commits.length, 1, 'nothing committed by proposing');
});

test('the model gets one chance to fix an invalid proposal', async () => {
  const cookie = await session();
  const bad = { reply: 'x', action: 'change', operations: [{ op: 'add', fields: { date: '31. Februar', title: 'X' } }] };
  const good = { reply: 'y', action: 'change', operations: [{ op: 'add', fields: { date: '28. Februar', title: 'X' } }] };
  geminiAnswers.push(bad, good);
  const r = await post(say('Neue Tour'), { cookie });
  assert.equal(r.data.proposal.changes[0].date, '28. Februar');
  assert.match(repo.calls[1].gemini.contents.at(-1).parts[0].text, /31\. Februar/);
});

test('two invalid proposals end in a message, never a change', async () => {
  const cookie = await session();
  const bad = { reply: 'x', action: 'change', operations: [{ op: 'delete', date: '1. Mai', title: 'Gibt es nicht' }] };
  geminiAnswers.push(bad, bad);
  const r = await post(say('Lösch das'), { cookie });
  assert.equal(r.status, 422);
  assert.equal(repo.commits.length, 1);
});

test('garbage from the model is an error, not a change', async () => {
  const cookie = await session();
  geminiAnswers.push('das ist kein json');
  const r = await post(say('Neue Tour'), { cookie });
  assert.equal(r.status, 502);
  assert.equal(repo.commits.length, 1);
});

// ── publishing ────────────────────────────────────────────
test('publishing commits the change, in date order, keeping old fields', async () => {
  const cookie = await session();
  const operations = [
    { op: 'add', fields: { date: '5. Juli', title: 'Gurnigel', distance: '85 km', url: 'https://www.komoot.com/de-de/tour/819535385' } },
    { op: 'update', date: '28. Juni', title: 'Wohlensee', fields: { meet: '08:00 · Casa' } },
  ];
  const r = await post({ action: 'publish', proposal: { type: 'change', operations } }, { cookie });
  assert.equal(r.status, 200);
  const { tours } = head().tours;
  assert.deepEqual(tours.map((t) => t.title), ['Wohlensee', 'Gurnigel', 'Sigriswil']);
  assert.equal(tours[0].gpx, '/assets/uploads/alt.gpx');
  assert.equal(tours[0].meet, '08:00 · Casa');
  assert.equal(tours[1].g1name, 'Gruppo Grappa');
  assert.equal(tours[1].g2name, '');
  assert.ok(tours[1].img.startsWith('/assets/tours/'));
  assert.match(head().message, /^Chat: /);
  assert.equal(head().author, undefined, 'commit author must stay the token owner');
  assert.deepEqual(head().files, ['src/data/tours.json']);
});

test('publishing re-checks the operations on the server', async () => {
  const cookie = await session();
  for (const fields of [
    { date: '5. Juli', title: 'X', url: 'https://evil.example/tour/1' },
    { date: '5. Juli', title: 'X', url: 'javascript:alert(1)' },
    { date: '5. Juli', title: 'X', garmin: 'http://connect.garmin.com/modern/course/1' },
    { date: '5. Juli', title: 'X', img: 'https://evil.example/a.jpg' },
    { date: '5. Juli', title: 'X', img: '/assets/../secret.jpg' },
    { date: '5. Juli', title: 'X', img: '/assets/a.svg' },
    { date: 'irgendwann', title: 'X' },
    { date: '5. Juli', title: 'y'.repeat(121) },
    { title: 'ohne Datum' },
  ]) {
    const r = await post({ action: 'publish', proposal: { type: 'change', operations: [{ op: 'add', fields }] } }, { cookie });
    assert.equal(r.status, 422, JSON.stringify(fields));
  }
  assert.equal(repo.commits.length, 1);
});

test('fields outside the list are ignored', async () => {
  const cookie = await session();
  const operations = [{ op: 'add', fields: { date: '5. Juli', title: 'X', gpx: '/x.gpx', evil: 'y' } }];
  await post({ action: 'publish', proposal: { type: 'change', operations } }, { cookie });
  const tour = head().tours.tours.find((t) => t.title === 'X');
  assert.equal(tour.gpx, undefined);
  assert.equal(tour.evil, undefined);
});

test('a CMS commit at the same moment does not get overwritten', async () => {
  const cookie = await session();
  moveHeadOnce = true;
  const operations = [{ op: 'delete', date: '12. Juli', title: 'Sigriswil' }];
  const r = await post({ action: 'publish', proposal: { type: 'change', operations } }, { cookie });
  assert.equal(r.status, 200);
  assert.equal(head().parent, 'cms');
});

test('a photo travels in the same commit', async () => {
  const cookie = await session();
  const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(50)]).toString('base64');
  const operations = [{ op: 'update', date: '12. Juli', title: 'Sigriswil', useAttachment: true, fields: {} }];
  const r = await post({ action: 'publish', proposal: { type: 'change', operations }, photo: { base64: jpeg } }, { cookie });
  assert.equal(r.status, 200);
  const img = head().tours.tours.find((t) => t.title === 'Sigriswil').img;
  assert.match(img, /^\/assets\/uploads\/tour-[0-9a-f]{16}\.jpg$/);
  assert.deepEqual(head().files.sort(), [`public${img}`, 'src/data/tours.json'].sort());
});

test('files that are not JPEGs are refused as photos', async () => {
  const cookie = await session();
  const operations = [{ op: 'update', date: '12. Juli', title: 'Sigriswil', useAttachment: true, fields: {} }];
  const svg = Buffer.from('<svg onload="alert(1)"/>').toString('base64');
  const r = await post({ action: 'publish', proposal: { type: 'change', operations }, photo: { base64: svg } }, { cookie });
  assert.equal(r.status, 422);
  assert.equal(repo.commits.length, 1);
});

test('the photo marker is never written without a photo', async () => {
  const cookie = await session();
  const operations = [{ op: 'update', date: '12. Juli', title: 'Sigriswil', useAttachment: true, fields: {} }];
  const r = await post({ action: 'publish', proposal: { type: 'change', operations } }, { cookie });
  assert.equal(r.status, 422);
});

// ── undo ──────────────────────────────────────────────────
test('undo restores the previous list after confirmation', async () => {
  const cookie = await session();
  await post({ action: 'publish', proposal: { type: 'change', operations: [{ op: 'delete', date: '12. Juli', title: 'Sigriswil' }] } }, { cookie });
  const sha = head().sha;
  const preview = await post({ action: 'propose-undo' }, { cookie });
  assert.equal(preview.data.proposal.commit, sha);
  assert.equal(preview.data.proposal.changes[0].kind, 'add');
  assert.equal(repo.commits.length, 2, 'undo preview commits nothing');
  const r = await post({ action: 'publish', proposal: { type: 'undo', commit: sha } }, { cookie });
  assert.equal(r.status, 200);
  assert.deepEqual(head().tours, seed());
});

test('asking in words reaches the same undo preview', async () => {
  const cookie = await session();
  await post({ action: 'publish', proposal: { type: 'change', operations: [{ op: 'delete', date: '12. Juli', title: 'Sigriswil' }] } }, { cookie });
  geminiAnswers.push({ reply: 'Ich mache das rückgängig.', action: 'undo' });
  const r = await post(say('Mach das rückgängig'), { cookie });
  assert.equal(r.data.proposal.type, 'undo');
});

test('CMS edits are never undone from the chat', async () => {
  const cookie = await session();
  const r = await post({ action: 'propose-undo' }, { cookie });
  assert.equal(r.data.proposal, null);
  assert.match(r.data.reply, /CMS/);
  const forced = await post({ action: 'publish', proposal: { type: 'undo', commit: 'c0' } }, { cookie });
  assert.equal(forced.status, 422);
  assert.equal(repo.commits.length, 1);
});

test('a stale undo is refused when something changed in between', async () => {
  const cookie = await session();
  await post({ action: 'publish', proposal: { type: 'change', operations: [{ op: 'delete', date: '12. Juli', title: 'Sigriswil' }] } }, { cookie });
  const sha = head().sha;
  await post({ action: 'publish', proposal: { type: 'change', operations: [{ op: 'add', fields: { date: '1. Mai', title: 'Neu' } }] } }, { cookie });
  const r = await post({ action: 'publish', proposal: { type: 'undo', commit: sha } }, { cookie });
  assert.equal(r.status, 422);
});

// ── rules ─────────────────────────────────────────────────
test('dates are normalized and months checked', () => {
  const add = (date) => applyOperations([], [{ op: 'add', fields: { date, title: 'X' } }]).tours[0].date;
  assert.equal(add('05. märz'), '5. März');
  assert.equal(add('29. Februar'), '29. Februar');
  assert.throws(() => add('31. April'), TourError);
  assert.throws(() => add('2026-03-14'), TourError);
});

test('komoot links with locale and share token pass, others not', () => {
  const add = (url) => applyOperations([], [{ op: 'add', fields: { date: '1. Mai', title: 'X', url } }]).tours[0].url;
  assert.ok(add('https://www.komoot.com/tour/123'));
  assert.ok(add('https://www.komoot.de/de-de/tour/123?share_token=abc&ref=wtd'));
  assert.throws(() => add('https://www.komoot.com.evil.example/tour/1'), TourError);
  assert.throws(() => add('https://www.komoot.com/user/1'), TourError);
  assert.throws(() => add('http://www.komoot.com/tour/1'), TourError);
});

test('a second group only appears when it has content', () => {
  const add = (fields) => applyOperations([], [{ op: 'add', fields: { date: '1. Mai', title: 'X', ...fields } }]).tours[0];
  assert.equal(add({}).g2name, '');
  assert.equal(add({ g2route: 'Casa-Thun-Casa' }).g2name, 'Gemeinsame Ausfahrt');
});

test('a no-op update is not offered as a change', () => {
  const tours = seed().tours;
  assert.throws(() => applyOperations(tours, [{ op: 'update', date: '12. Juli', title: 'Sigriswil', fields: { title: 'Sigriswil' } }]), /nichts zu ändern/);
});

test('re-dating a tour moves it; the input list stays untouched', () => {
  const tours = seed().tours;
  const r = applyOperations(tours, [{ op: 'update', date: '28. Juni', title: 'Wohlensee', fields: { date: '1. August' } }]);
  assert.deepEqual(r.tours.map((t) => t.title), ['Sigriswil', 'Wohlensee']);
  assert.equal(tours[0].date, '28. Juni');
});

test('diffTours describes what a restore would do', () => {
  const a = seed().tours;
  const changes = diffTours(a.slice(0, 1), a);
  assert.deepEqual(changes.map((c) => c.kind), ['add']);
});
