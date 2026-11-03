// Run with `npm test`. Exercises the real handler with GitHub and Gemini faked at
// the fetch level, so login, validation and commits are covered without any keys.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/chat.js';
import { retry } from '../api/_chat-gemini.js';
import { applyOperations, COLLECTIONS, ContentError, diffContent } from '../api/_chat-content.js';
import { cleanPageText, pickTourPages } from '../src/scripts/chat-pdf.js';
import { marksForChanges, pickContext, pickLabel } from '../src/scripts/chat-marks.js';

const TOUR = (date, title, extra = {}) => ({ date, title, img: '/assets/tours/tour-1.jpg', g1name: 'Gruppo Grappa', ...extra });
const seed = () => ({
  'src/data/tours.json': {
    tours: [
      TOUR('28. Juni', 'Wohlensee', { url: 'https://www.komoot.com/de-de/tour/1', gpx: '/assets/uploads/alt.gpx' }),
      TOUR('12. Juli', 'Sigriswil'),
    ],
  },
  'src/data/members.json': { members: [{ name: 'Salvatore Schiavano', role: 'Präsident', photo: '' }, { name: 'Rolf Muster', role: 'Kassier', photo: '' }] },
  'src/data/sponsors.json': { sponsors: [{ name: 'Thömus', url: 'https://thoemus.ch', logo: '/assets/sponsors/thoemus.jpg' }, { name: 'gäggeli siech', url: 'https://example.ch', logo: '/assets/sponsors/g.jpg' }] },
  'src/data/gallery.json': { images: [{ image: '/assets/gallery/a.jpg', caption: '' }, { image: '/assets/gallery/b.jpg', caption: '' }] },
  'src/data/site.json': { heroMotto: 'Passione su due ruote.', heroVideo: '/assets/uploads/a.jpg', heroPoster: '/assets/uploads/a.jpg', brochure: '/assets/uploads/alt.pdf' },
});
const state = () => {
  const d = head().data;
  return { tours: d['src/data/tours.json'].tours, members: d['src/data/members.json'].members, sponsors: d['src/data/sponsors.json'].sponsors, gallery: d['src/data/gallery.json'].images, site: d['src/data/site.json'] };
};
const asContent = (d) => ({ tours: d['src/data/tours.json'].tours, members: d['src/data/members.json'].members, sponsors: d['src/data/sponsors.json'].sponsors, gallery: d['src/data/gallery.json'].images, site: d['src/data/site.json'] });

// ── fake GitHub + Gemini ──────────────────────────────────
let repo;
let geminiAnswers;
let moveHeadOnce;

const b64 = (data) => Buffer.from(JSON.stringify(data)).toString('base64');
const json = (data, status = 200) => new Response(JSON.stringify(data), { status });

function resetRepo() {
  repo = {
    commits: [{ sha: 'c0', message: 'Update Touren', parent: null, data: seed() }],
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
    repo.calls.push({ gemini: body, model: u.pathname });
    const answer = geminiAnswers.shift();
    if (answer?.httpStatus) return json({ error: 'busy' }, answer.httpStatus);
    return json({ candidates: [{ content: { parts: [{ text: typeof answer === 'string' ? answer : JSON.stringify(answer) }] } }] });
  }
  assert.equal(options.headers.Authorization, 'Bearer gh-token');
  const path = u.pathname.replace('/repos/DBS699/casa-italia', '');
  if (path.startsWith('/contents/')) {
    const ref = u.searchParams.get('ref');
    const commit = ref === 'main' ? head() : repo.commits.find((c) => c.sha === ref);
    return json({ content: b64(commit.data[path.replace('/contents/', '')]) });
  }
  if (path === '/git/ref/heads/main') return json({ object: { sha: head().sha } });
  if (path === '/commits') {
    assert.equal(u.searchParams.get('path'), 'src/data');
    const c = [...repo.commits].reverse().find((x) => x.touchesData !== false);
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
      repo.commits.push({ sha: 'cms', message: 'Update Sponsoren', parent: head().sha, data: head().data, touchesData: false });
      repo.pending = {};
      return json({ message: 'not a fast forward' }, 422);
    }
    assert.equal(repo.pending.commit.parent, head().sha, 'commit must build on the current head');
    const data = { ...head().data };
    for (const entry of repo.pending.tree) {
      if (entry.path.startsWith('src/data/')) data[entry.path] = JSON.parse(Buffer.from(repo.pending[entry.sha], 'base64').toString('utf8'));
    }
    repo.commits.push({ ...repo.pending.commit, data, files: repo.pending.tree.map((f) => f.path) });
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
  delete process.env.BLOB_READ_WRITE_TOKEN;
  delete process.env.GEMINI_MODEL;
}
let nextIp = 1;
async function session() {
  const r = await post({ action: 'login', password: PASSWORD });
  assert.equal(r.status, 200);
  return r.cookie.split(';')[0];
}
const say = (text, extra = {}) => ({ action: 'propose', messages: [{ role: 'user', text }], ...extra });
const change = (operations, files) => ({ action: 'publish', proposal: { type: 'change', operations }, files });
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(50)]).toString('base64');
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(50)]).toString('base64');
const BLOB = 'https://abc123.public.blob.vercel-storage.com/chat/video-xyz.mp4';

beforeEach(() => { configure(); resetRepo(); retry.delaysMs = [0, 0]; });

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

test('upload tokens need a login and only allow video and PDF', async () => {
  process.env.BLOB_READ_WRITE_TOKEN = 'vercel_blob_rw_teststore_secretsecret';
  const request = { type: 'blob.generate-client-token', payload: { pathname: 'chat/a.pdf', multipart: false, clientPayload: null } };
  assert.equal((await post(request)).status, 401);
  const cookie = await session();
  const r = await post(request, { cookie });
  assert.equal(r.status, 200);
  const payload = Buffer.from(Buffer.from(r.data.clientToken.split('_').pop(), 'base64').toString().split('.')[1], 'base64').toString();
  assert.match(payload, /application\/pdf/);
  assert.doesNotMatch(payload, /text\/html|image\/svg/);
  assert.equal((await post({ action: 'status' }, { cookie })).data.uploads, true);
});

// ── proposing ─────────────────────────────────────────────
test('a question changes nothing', async () => {
  const cookie = await session();
  geminiAnswers.push({ reply: 'Am 12. Juli ist die Sigriswil-Runde.', action: 'none' });
  const r = await post(say('Was ist im Juli?'), { cookie });
  assert.equal(r.data.proposal, null);
  assert.equal(repo.commits.length, 1);
});

test('the model sees every CMS area', async () => {
  const cookie = await session();
  geminiAnswers.push({ reply: 'Gut.', action: 'none' });
  await post(say('Hallo'), { cookie });
  const system = repo.calls[0].gemini.systemInstruction.parts[0].text;
  for (const text of ['Sigriswil', 'Rolf Muster', 'gäggeli siech', '/assets/gallery/a.jpg', 'Passione su due ruote']) assert.ok(system.includes(text), text);
  assert.ok(!system.includes('alt.gpx'), 'old GPX paths are not offered');
});

test('removing a sponsor is a proposal first, then a commit of only that file', async () => {
  const cookie = await session();
  const operations = [{ collection: 'sponsors', op: 'delete', match: { name: 'gäggeli siech' } }];
  geminiAnswers.push({ reply: 'Ich entferne ihn.', action: 'change', operations });
  const r = await post(say('gäggeli siech als sponsor entfernen bitte'), { cookie });
  assert.equal(r.data.proposal.changes[0].kind, 'delete');
  assert.equal(r.data.proposal.changes[0].area, 'Sponsoren');
  assert.equal(repo.commits.length, 1, 'nothing committed by proposing');
  const published = await post(change(r.data.proposal.operations), { cookie });
  assert.equal(published.status, 200);
  assert.deepEqual(state().sponsors.map((s) => s.name), ['Thömus']);
  assert.deepEqual(head().files, ['src/data/sponsors.json']);
});

test('a rename from the model goes through as a preview and a commit', async () => {
  const cookie = await session();
  geminiAnswers.push({
    reply: 'Ich benenne ihn um.',
    action: 'change',
    operations: [{ collection: 'sponsors', op: 'update', match: { name: 'Thömus' }, fields: [{ name: 'name', value: 'Velokartoffel' }] }],
  });
  const r = await post(say('Thömus zu Velokartoffel umbenennen'), { cookie });
  assert.deepEqual(r.data.proposal.operations[0].fields, { name: 'Velokartoffel' });
  const field = r.data.proposal.changes[0].fields[0];
  assert.deepEqual([field.before, field.after], ['Thömus', 'Velokartoffel']);
  assert.equal((await post(change(r.data.proposal.operations), { cookie })).status, 200);
  assert.deepEqual(state().sponsors.map((s) => s.name), ['Velokartoffel', 'gäggeli siech']);
});

test('the schema makes the model name a value for every field', async () => {
  const cookie = await session();
  geminiAnswers.push({ reply: 'Gut.', action: 'none' });
  await post(say('Hallo'), { cookie });
  const { fields } = repo.calls[0].gemini.generationConfig.responseSchema.properties.operations.items.properties;
  assert.equal(fields.type, 'array');
  assert.deepEqual(fields.items.required, ['name', 'value']);
  assert.ok(fields.items.properties.name.enum.includes('heroMotto'));
});

test('an update without a new value does not claim it is already there', async () => {
  const cookie = await session();
  const empty = { reply: 'x', action: 'change', operations: [{ collection: 'sponsors', op: 'update', match: { name: 'Thömus' }, fields: [] }] };
  geminiAnswers.push(empty, { reply: 'Ich benenne ihn um.', action: 'change', operations: [{ collection: 'sponsors', op: 'update', match: { name: 'Thömus' }, fields: [{ name: 'name', value: 'Neu' }] }] });
  const fixed = await post(say('Umbenennen'), { cookie });
  assert.equal(fixed.data.proposal.changes[0].fields[0].after, 'Neu');
  geminiAnswers.push(empty, empty);
  const r = await post(say('Umbenennen'), { cookie });
  assert.equal(r.status, 422);
  assert.match(r.data.error, /nicht richtig verstanden/);
  assert.doesNotMatch(r.data.error, /schon so eingetragen/);
});

test('the model gets one chance to fix an invalid proposal', async () => {
  const cookie = await session();
  const bad = { reply: 'x', action: 'change', operations: [{ collection: 'tours', op: 'add', fields: { date: '31. Februar', title: 'X' } }] };
  const good = { reply: 'y', action: 'change', operations: [{ collection: 'tours', op: 'add', fields: { date: '28. Februar', title: 'X' } }] };
  geminiAnswers.push(bad, good);
  const r = await post(say('Neue Tour'), { cookie });
  assert.equal(r.data.proposal.changes[0].title, 'X · 28. Februar');
  assert.match(repo.calls[1].gemini.contents.at(-1).parts[0].text, /31\. Februar/);
});

test('two invalid proposals end in a message, never a change', async () => {
  const cookie = await session();
  const bad = { reply: 'x', action: 'change', operations: [{ collection: 'sponsors', op: 'delete', match: { name: 'Gibt es nicht' } }] };
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

test('an overloaded model falls through to the next one', async () => {
  const cookie = await session();
  geminiAnswers.push({ httpStatus: 503 }, { reply: 'Hallo.', action: 'none' });
  const r = await post(say('Hallo'), { cookie });
  assert.equal(r.status, 200);
  assert.notEqual(repo.calls[0].model, repo.calls[1].model);
});

test('when all models are busy the message says so', async () => {
  const cookie = await session();
  for (let i = 0; i < 6; i += 1) geminiAnswers.push({ httpStatus: 503 });
  const r = await post(say('Hallo'), { cookie });
  assert.equal(r.status, 503);
  assert.match(r.data.error, /überlastet/);
  assert.equal(repo.calls.length, 6);
});

test('when all models are busy for a moment the chat waits and tries again', async () => {
  const cookie = await session();
  geminiAnswers.push({ httpStatus: 503 }, { httpStatus: 503 }, { httpStatus: 503 }, { reply: 'Hallo.', action: 'none' });
  const r = await post(say('Hallo'), { cookie });
  assert.equal(r.status, 200);
  assert.equal(r.data.reply, 'Hallo.');
});

test('a key problem does not silently try other models', async () => {
  const cookie = await session();
  geminiAnswers.push({ httpStatus: 403 });
  const r = await post(say('Hallo'), { cookie });
  assert.equal(r.status, 502);
  assert.equal(repo.calls.length, 1);
});

test('PDF text reaches the model only with the message it belongs to', async () => {
  const cookie = await session();
  geminiAnswers.push({ reply: 'Gut.', action: 'none' });
  await post(say('Touren eintragen', { documents: [{ name: 'prog.pdf', text: 'KM 50/HM 547' }], attachments: [{ id: 'datei1', kind: 'pdf', name: 'prog.pdf' }] }), { cookie });
  const { gemini } = repo.calls[0];
  assert.match(gemini.contents.at(-1).parts[1].text, /KM 50\/HM 547/);
  assert.match(gemini.systemInstruction.parts[0].text, /@datei1/);
});

// ── publishing ────────────────────────────────────────────
test('publishing commits the change, in date order, keeping old fields', async () => {
  const cookie = await session();
  const operations = [
    { collection: 'tours', op: 'add', fields: { date: '5. Juli', title: 'Gurnigel', distance: '85 km', url: 'https://www.komoot.com/de-de/tour/819535385' } },
    { collection: 'tours', op: 'update', match: { date: '28. Juni', title: 'Wohlensee' }, fields: { meet: '08:00 · Casa' } },
  ];
  const r = await post(change(operations), { cookie });
  assert.equal(r.status, 200);
  const { tours } = state();
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

test('one proposal can touch several areas in one commit', async () => {
  const cookie = await session();
  const operations = [
    { collection: 'site', op: 'update', fields: { heroMotto: 'Sempre avanti.' } },
    { collection: 'members', op: 'add', fields: { name: 'Maria Rossi', role: 'Aktuarin' } },
    { collection: 'members', op: 'update', match: { name: 'Rolf Muster' }, fields: { role: 'Vizepräsident' } },
    { collection: 'gallery', op: 'delete', match: { image: '/assets/gallery/a.jpg' } },
  ];
  assert.equal((await post(change(operations), { cookie })).status, 200);
  const s = state();
  assert.equal(s.site.heroMotto, 'Sempre avanti.');
  assert.equal(s.site.heroPoster, '/assets/uploads/a.jpg');
  assert.deepEqual(s.members.map((m) => m.role), ['Präsident', 'Vizepräsident', 'Aktuarin']);
  assert.deepEqual(s.gallery.map((g) => g.image), ['/assets/gallery/b.jpg']);
  assert.deepEqual(head().files.sort(), ['src/data/gallery.json', 'src/data/members.json', 'src/data/site.json']);
});

test('lists can be reordered, tours cannot', async () => {
  const cookie = await session();
  assert.equal((await post(change([{ collection: 'sponsors', op: 'move', match: { name: 'gäggeli siech' }, position: 1 }]), { cookie })).status, 200);
  assert.deepEqual(state().sponsors.map((s) => s.name), ['gäggeli siech', 'Thömus']);
  const r = await post(change([{ collection: 'tours', op: 'move', match: { date: '12. Juli', title: 'Sigriswil' }, position: 1 }]), { cookie });
  assert.equal(r.status, 422);
});

test('publishing re-checks the operations on the server', async () => {
  const cookie = await session();
  const tour = (fields) => ({ collection: 'tours', op: 'add', fields: { date: '5. Juli', title: 'X', ...fields } });
  for (const op of [
    tour({ url: 'https://evil.example/tour/1' }),
    tour({ url: 'javascript:alert(1)' }),
    tour({ garmin: 'http://connect.garmin.com/modern/course/1' }),
    tour({ img: 'https://evil.example/a.jpg' }),
    tour({ img: '/assets/../secret.jpg' }),
    tour({ img: '/assets/a.svg' }),
    tour({ img: BLOB }),
    tour({ date: 'irgendwann' }),
    tour({ title: 'y'.repeat(121) }),
    { collection: 'tours', op: 'add', fields: { title: 'ohne Datum' } },
    { collection: 'sponsors', op: 'add', fields: { name: 'Ohne Logo', url: 'https://x.ch' } },
    { collection: 'sponsors', op: 'add', fields: { name: 'Link', url: 'javascript:alert(1)', logo: '/assets/a.jpg' } },
    { collection: 'members', op: 'add', fields: { name: 'Ohne Funktion' } },
    { collection: 'members', op: 'update', match: { name: 'Rolf Muster' }, fields: { name: '' } },
    { collection: 'gallery', op: 'add', fields: { caption: 'ohne Bild' } },
    { collection: 'site', op: 'delete' },
    { collection: 'site', op: 'add', fields: { heroMotto: 'x' } },
    { collection: 'site', op: 'update', fields: { heroMotto: '' } },
    { collection: 'site', op: 'update', fields: { brochure: 'https://evil.example/a.pdf' } },
    { collection: 'site', op: 'update', fields: { heroVideo: 'https://evil.example/a.mp4' } },
    { collection: 'content', op: 'update', fields: {} },
  ]) {
    const r = await post(change([op]), { cookie });
    assert.equal(r.status, 422, JSON.stringify(op));
  }
  assert.equal(repo.commits.length, 1);
});

test('fields outside the list are ignored', async () => {
  const cookie = await session();
  await post(change([{ collection: 'tours', op: 'add', fields: { date: '5. Juli', title: 'X', gpx: '/x.gpx', evil: 'y', logo: '/a.jpg' } }]), { cookie });
  const tour = state().tours.find((t) => t.title === 'X');
  assert.equal(tour.gpx, undefined);
  assert.equal(tour.evil, undefined);
  assert.equal(tour.logo, undefined);
});

test('a CMS commit at the same moment does not get overwritten', async () => {
  const cookie = await session();
  moveHeadOnce = true;
  const r = await post(change([{ collection: 'tours', op: 'delete', match: { date: '12. Juli', title: 'Sigriswil' } }]), { cookie });
  assert.equal(r.status, 200);
  assert.equal(head().parent, 'cms');
});

// ── attachments ───────────────────────────────────────────
test('a proposal previews an attachment by name, publishing stores the real path', async () => {
  const cookie = await session();
  const operations = [{ collection: 'sponsors', op: 'add', fields: { name: 'Neu', url: 'https://neu.ch', logo: '@datei1' } }];
  geminiAnswers.push({ reply: 'Ok.', action: 'change', operations });
  const preview = await post(say('Neuer Sponsor', { attachments: [{ id: 'datei1', kind: 'image', name: 'logo.png' }] }), { cookie });
  const logoField = preview.data.proposal.changes[0].fields.find((f) => f.label === 'Logo');
  assert.equal(logoField.after, '(neue Datei: logo.png)');
  assert.equal((await post(change(operations, [{ id: 'datei1', kind: 'image', base64: PNG }]), { cookie })).status, 200);
  const { logo } = state().sponsors.find((s) => s.name === 'Neu');
  assert.match(logo, /^\/assets\/uploads\/chat-[0-9a-f]{16}\.png$/);
  assert.deepEqual(head().files.sort(), [`public${logo}`, 'src/data/sponsors.json'].sort());
});

test('several images can land in the gallery in one commit', async () => {
  const cookie = await session();
  const other = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(60, 1)]).toString('base64');
  const operations = [
    { collection: 'gallery', op: 'add', fields: { image: '@datei1', caption: 'Eins' } },
    { collection: 'gallery', op: 'add', fields: { image: '@datei2' }, position: 1 },
  ];
  const files = [{ id: 'datei1', kind: 'image', base64: JPEG }, { id: 'datei2', kind: 'image', base64: other }];
  assert.equal((await post(change(operations, files), { cookie })).status, 200);
  const { gallery } = state();
  assert.equal(gallery.length, 4);
  assert.match(gallery[0].image, /chat-.*\.jpg$/);
  assert.equal(gallery[3].caption, 'Eins');
  assert.equal(head().files.length, 3);
});

test('files that are not images are refused as images', async () => {
  const cookie = await session();
  const svg = Buffer.from('<svg onload="alert(1)"/>').toString('base64');
  const operations = [{ collection: 'tours', op: 'update', match: { date: '12. Juli', title: 'Sigriswil' }, fields: { img: '@datei1' } }];
  assert.equal((await post(change(operations, [{ id: 'datei1', kind: 'image', base64: svg }]), { cookie })).status, 422);
  assert.equal(repo.commits.length, 1);
});

test('an attachment that is missing or of the wrong kind is refused', async () => {
  const cookie = await session();
  const logo = (value) => [{ collection: 'sponsors', op: 'update', match: { name: 'Thömus' }, fields: { logo: value } }];
  assert.equal((await post(change(logo('@datei1')), { cookie })).status, 422);
  assert.equal((await post(change(logo('@datei1'), [{ id: 'datei1', kind: 'pdf', url: 'https://abc.public.blob.vercel-storage.com/a.pdf' }]), { cookie })).status, 422);
  assert.equal(repo.commits.length, 1);
});

test('video and PDF come from Blob storage and nowhere else', async () => {
  const cookie = await session();
  const video = [{ collection: 'site', op: 'update', fields: { heroVideo: '@datei1' } }];
  assert.equal((await post(change(video, [{ id: 'datei1', kind: 'video', url: 'https://evil.example/a.mp4' }]), { cookie })).status, 422);
  assert.equal((await post(change(video, [{ id: 'datei1', kind: 'video', url: BLOB }]), { cookie })).status, 200);
  assert.equal(state().site.heroVideo, BLOB);
  const pdf = 'https://abc123.public.blob.vercel-storage.com/chat/programm-1.pdf';
  assert.equal((await post(change([{ collection: 'site', op: 'update', fields: { brochure: '@datei2' } }], [{ id: 'datei2', kind: 'pdf', url: pdf }]), { cookie })).status, 200);
  assert.equal(state().site.brochure, pdf);
});

// ── undo ──────────────────────────────────────────────────
test('undo restores every area the last change touched', async () => {
  const cookie = await session();
  await post(change([
    { collection: 'sponsors', op: 'delete', match: { name: 'gäggeli siech' } },
    { collection: 'site', op: 'update', fields: { heroMotto: 'Neu' } },
  ]), { cookie });
  const sha = head().sha;
  const preview = await post({ action: 'propose-undo' }, { cookie });
  assert.equal(preview.data.proposal.commit, sha);
  assert.deepEqual(preview.data.proposal.changes.map((c) => c.kind).sort(), ['add', 'update']);
  assert.equal(repo.commits.length, 2, 'undo preview commits nothing');
  const r = await post({ action: 'publish', proposal: { type: 'undo', commit: sha } }, { cookie });
  assert.equal(r.status, 200);
  assert.deepEqual(head().data, seed());
  assert.deepEqual(head().files.sort(), ['src/data/site.json', 'src/data/sponsors.json']);
});

test('asking in words reaches the same undo preview', async () => {
  const cookie = await session();
  await post(change([{ collection: 'tours', op: 'delete', match: { date: '12. Juli', title: 'Sigriswil' } }]), { cookie });
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
  await post(change([{ collection: 'tours', op: 'delete', match: { date: '12. Juli', title: 'Sigriswil' } }]), { cookie });
  const sha = head().sha;
  await post(change([{ collection: 'members', op: 'add', fields: { name: 'Neu', role: 'Beisitz' } }]), { cookie });
  const r = await post({ action: 'publish', proposal: { type: 'undo', commit: sha } }, { cookie });
  assert.equal(r.status, 422);
});

// ── rules ─────────────────────────────────────────────────
const content = () => asContent(seed());
const addTour = (fields) => applyOperations(content(), [{ collection: 'tours', op: 'add', fields: { date: '1. Mai', title: 'X', ...fields } }]).state.tours;

test('the chat offers exactly the CMS collections', () => {
  assert.deepEqual(Object.keys(COLLECTIONS).sort(), ['gallery', 'members', 'site', 'sponsors', 'tours']);
  assert.deepEqual(Object.keys(COLLECTIONS.site.fields), ['heroMotto', 'heroVideo', 'heroPoster', 'brochure']);
  assert.deepEqual(Object.keys(COLLECTIONS.sponsors.fields), ['name', 'url', 'logo']);
  assert.deepEqual(Object.keys(COLLECTIONS.members.fields), ['name', 'role', 'photo']);
  assert.deepEqual(Object.keys(COLLECTIONS.gallery.fields), ['image', 'caption']);
});

test('dates are normalized and months checked', () => {
  const dated = (date) => addTour({ date })[0].date;
  assert.equal(dated('05. märz'), '5. März');
  assert.equal(dated('29. Februar'), '29. Februar');
  assert.throws(() => dated('31. April'), ContentError);
  assert.throws(() => dated('2026-03-14'), ContentError);
});

test('komoot links with locale and share token pass, others not', () => {
  const link = (url) => addTour({ url }).find((t) => t.title === 'X').url;
  assert.ok(link('https://www.komoot.com/tour/123'));
  assert.ok(link('https://www.komoot.de/de-de/tour/123?share_token=abc&ref=wtd'));
  assert.throws(() => link('https://www.komoot.com.evil.example/tour/1'), ContentError);
  assert.throws(() => link('https://www.komoot.com/user/1'), ContentError);
  assert.throws(() => link('http://www.komoot.com/tour/1'), ContentError);
});

test('a second group only appears when it has content', () => {
  const tour = (fields) => addTour(fields).find((t) => t.title === 'X');
  assert.equal(tour({}).g2name, '');
  assert.equal(tour({ g2route: 'Casa-Thun-Casa' }).g2name, 'Gemeinsame Ausfahrt');
});

test('a no-op update is not offered as a change', () => {
  const op = { collection: 'tours', op: 'update', match: { date: '12. Juli', title: 'Sigriswil' }, fields: { title: 'Sigriswil' } };
  assert.throws(() => applyOperations(content(), [op]), /nichts zu ändern/);
});

test('re-dating a tour moves it; the input stays untouched', () => {
  const before = content();
  const r = applyOperations(before, [{ collection: 'tours', op: 'update', match: { date: '28. Juni', title: 'Wohlensee' }, fields: { date: '1. August' } }]);
  assert.deepEqual(r.state.tours.map((t) => t.title), ['Sigriswil', 'Wohlensee']);
  assert.equal(before.tours[0].date, '28. Juni');
});

test('a whole programme can be imported at once', () => {
  const months = ['März', 'April', 'Mai', 'Juni', 'Juli', 'August'];
  const operations = Array.from({ length: 30 }, (_, i) => ({ collection: 'tours', op: 'add', fields: { date: `${(i % 28) + 1}. ${months[i % 6]}`, title: `Tour ${i}` } }));
  const { state: s, changes } = applyOperations(content(), operations);
  assert.equal(changes.length, 30);
  assert.equal(s.tours.length, 32);
});

test('diffContent describes what a restore would do', () => {
  const a = content();
  const b = { ...a, tours: a.tours.slice(0, 1), sponsors: [...a.sponsors].reverse() };
  const changes = diffContent(b, a);
  assert.deepEqual(changes.map((c) => [c.area, c.kind]), [['Touren', 'add'], ['Sponsoren', 'move']]);
});

// ── programme PDF ─────────────────────────────────────────
test('split-up digits from the PDF are put back together', () => {
  assert.equal(cleanPageText('0 1 .0 3 .20 2 6   gruppo   grappa'), '01.03.2026 gruppo grappa');
  assert.equal(cleanPageText('März :   Treffpunkt   9 . 3 0 Uhr'), 'März : Treffpunkt 9.30 Uhr');
  assert.equal(cleanPageText('KM 5 0 /HM   5 47'), 'KM 50 /HM 547');
});

test('member lists never leave the browser, tour pages do', () => {
  const members = 'Anna Muster, Weg 1, 3012 Bern\nBeat Muster, Gasse 2, 3005 Bern\nCarla Muster, Platz 3, 3097 Liebefeld';
  const meeting = 'Treffpunkt für die Sonntagsausfahrten: Brunnen beim Kreisel';
  const tours = 'März : Treffpunkt 9 . 3 0 Uhr\n0 1 .0 3 .20 2 6 gruppo grappa\nCasa - Bösingen - Casa\nKM 5 0 /HM 547\n0 8 .03.2026 Casa - Aaretal - Casa\nKM 50/HM 547\n1 5 .03.2026 Casa - Thun - Casa\nKM 53/HM 750';
  const r = pickTourPages(['Titelseite', members, meeting, tours, 'Generalversammlung 2026']);
  assert.deepEqual(r.numbers, [3, 4]);
  assert.ok(!r.text.includes('Muster'));
  assert.match(r.text, /01\.03\.2026/);
});

test('a member list that mentions kilometres is still kept back', () => {
  const r = pickTourPages(['Anna, 3012 Bern, 12 km\nBeat, 3005 Bern\nCarla, 3097 Liebefeld']);
  assert.deepEqual(r.numbers, []);
  assert.equal(r.text, '');
});

// ── markers on the website ────────────────────────────────
const changesFor = (operations) => applyOperations(content(), operations).changes;

test('changes name the website entry they belong to', () => {
  const [del] = changesFor([{ collection: 'sponsors', op: 'delete', match: { name: 'Thömus' } }]);
  assert.deepEqual([del.collection, del.key], ['sponsors', 'Thömus']);
  const [redated] = changesFor([{ collection: 'tours', op: 'update', match: { date: '28. Juni', title: 'Wohlensee' }, fields: { date: '1. August' } }]);
  assert.equal(redated.key, '28. Juni|Wohlensee', 'still on the page under the old date');
  assert.equal(redated.afterKey, '1. August|Wohlensee');
});

test('a proposal marks the entry, or the area when it is new', () => {
  const marks = marksForChanges(changesFor([
    { collection: 'sponsors', op: 'delete', match: { name: 'Thömus' } },
    { collection: 'members', op: 'add', fields: { name: 'Maria Rossi', role: 'Aktuarin' } },
    { collection: 'site', op: 'update', fields: { heroMotto: 'Neu' } },
  ]));
  assert.deepEqual(marks.map((m) => [m.collection, m.key, m.tone]), [
    ['sponsors', 'Thömus', 'delete'],
    ['members', '', 'add'],
    ['site', 'heroMotto', 'update'],
  ]);
  assert.match(marks[1].note, /Maria Rossi/);
});

test('once online, new entries are marked themselves and deleted ones by their area', () => {
  const marks = marksForChanges(changesFor([
    { collection: 'sponsors', op: 'delete', match: { name: 'Thömus' } },
    { collection: 'members', op: 'add', fields: { name: 'Maria Rossi', role: 'Aktuarin' } },
  ]), { published: true });
  assert.deepEqual(marks.map((m) => [m.collection, m.key]), [['sponsors', ''], ['members', 'Maria Rossi']]);
  assert.match(marks[0].note, /Thömus/);
});

test('a whole programme gets one marker around the tours', () => {
  const operations = Array.from({ length: 30 }, (_, i) => ({ collection: 'tours', op: 'add', fields: { date: `${(i % 28) + 1}. Mai`, title: `Tour ${i}` } }));
  const marks = marksForChanges(changesFor(operations));
  assert.equal(marks.length, 1);
  assert.deepEqual([marks[0].collection, marks[0].key], ['tours', '']);
  assert.match(marks[0].note, /30/);
});

test('a clicked entry tells the model exactly what is meant', () => {
  assert.equal(pickLabel('tours', '28. Juni|Wohlensee'), 'Tour «Wohlensee» am 28. Juni');
  assert.equal(pickLabel('sponsors', ''), 'Bereich Sponsoren');
  const context = pickContext({ collection: 'sponsors', key: 'Thömus', label: pickLabel('sponsors', 'Thömus') });
  assert.match(context, /Sponsor: Thömus/);
  assert.match(context, /collection: sponsors/);
});

test('website keys match what the components render', async () => {
  const { readFile } = await import('node:fs/promises');
  const read = (name) => readFile(new URL(`../src/components/${name}.astro`, import.meta.url), 'utf8');
  assert.match(await read('Season'), /data-chat-key=\{`\$\{tour\.date\}\|\$\{tour\.title\}`\}/);
  assert.match(await read('Sponsors'), /data-chat-item="sponsors" data-chat-key=\{s\.name\}/);
  assert.match(await read('Committee'), /data-chat-item="members" data-chat-key=\{m\.name\}/);
  assert.match(await read('Gallery'), /data-chat-item="gallery" data-chat-key=\{s\.image\}/);
});
