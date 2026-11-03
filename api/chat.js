// Chat admin endpoint: POST { action, ... } from the /chat page.
// Requires env vars CHAT_PASSWORD (12+ characters), GEMINI_API_KEY and
// CHAT_GITHUB_TOKEN (set in the Vercel project; GEMINI_MODEL optionally overrides
// the model). Without them the page just says the chat isn't set up yet.
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { applyOperations, diffTours, summarize, TourError } from './_chat-tours.js';
import { askGemini } from './_chat-gemini.js';
import { commitFiles, COMMIT_PREFIX, headCommit, latestToursCommit, readToursAt, TOURS_PATH } from './_chat-github.js';

const COOKIE = 'vcc_chat';
const SESSION_SECONDS = 30 * 24 * 3600;
const MAX_FAILURES = 5;
const LOCK_MS = 10 * 60 * 1000;
const MAX_PHOTO_BYTES = 3 * 1024 * 1024;

// Failed logins per IP. Serverless instances don't share this, so it only slows
// guessing down — the real protection is the long password.
const failures = new Map();

const hash = (text) => createHash('sha256').update(text).digest();
const sameText = (a, b) => timingSafeEqual(hash(a), hash(b));

function isConfigured() {
  const { CHAT_PASSWORD, GEMINI_API_KEY, CHAT_GITHUB_TOKEN } = process.env;
  return Boolean(CHAT_PASSWORD && CHAT_PASSWORD.length >= 12 && GEMINI_API_KEY && CHAT_GITHUB_TOKEN);
}

// Keyed on the password, so changing it signs everyone out.
function sign(expires) {
  return createHmac('sha256', hash(`chat-session:${process.env.CHAT_PASSWORD}`)).update(String(expires)).digest('hex');
}

function isLoggedIn(req) {
  const match = String(req.headers.cookie || '').match(new RegExp(`(?:^|;\\s*)${COOKIE}=(\\d+)\\.([0-9a-f]+)`));
  if (!match || Number(match[1]) * 1000 < Date.now()) return false;
  return sameText(match[2], sign(match[1]));
}

function setSession(res, value, maxAge) {
  res.setHeader('Set-Cookie', `${COOKIE}=${value}; Path=/api/chat; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`);
}

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

function isSameOrigin(req) {
  try { return new URL(req.headers.origin).host === req.headers.host; } catch (e) { return false; }
}

async function login(req, res, body) {
  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  const entry = failures.get(ip);
  if (entry && entry.count >= MAX_FAILURES && Date.now() - entry.last < LOCK_MS) {
    return send(res, 429, { error: 'Zu viele Versuche. Bitte in 10 Minuten nochmals probieren.' });
  }
  if (!sameText(String(body.password ?? ''), process.env.CHAT_PASSWORD)) {
    failures.set(ip, { count: (entry?.count ?? 0) + 1, last: Date.now() });
    await new Promise((resolve) => setTimeout(resolve, 500));
    return send(res, 401, { error: 'Das Passwort stimmt nicht.' });
  }
  failures.delete(ip);
  const expires = Math.floor(Date.now() / 1000) + SESSION_SECONDS;
  setSession(res, `${expires}.${sign(expires)}`, SESSION_SECONDS);
  return send(res, 200, { loggedIn: true });
}

async function undoProposal(reply) {
  const latest = await latestToursCommit();
  if (!latest || !latest.message.startsWith(COMMIT_PREFIX) || !latest.parent) {
    return { reply: 'Das kann ich nicht rückgängig machen: Die letzte Änderung an den Touren kam nicht aus diesem Chat, sondern wurde im CMS gemacht.', proposal: null };
  }
  const [current, previous] = await Promise.all([readToursAt(), readToursAt(latest.parent)]);
  const changes = diffTours(current.tours, previous.tours);
  if (changes.length === 0) return { reply: 'Da gibt es nichts rückgängig zu machen.', proposal: null };
  return { reply: reply || 'So würde ich die letzte Änderung rückgängig machen:', proposal: { type: 'undo', commit: latest.sha, changes } };
}

async function propose(body) {
  const messages = Array.isArray(body.messages) ? body.messages : [];
  if (messages.length === 0) throw new TourError('Bitte schreib zuerst, was du ändern möchtest.');
  const hasAttachment = Boolean(body.hasAttachment);
  const { tours } = await readToursAt();
  const answer = await askGemini({
    messages,
    tours,
    hasAttachment,
    validate: (operations) => {
      const { changes } = applyOperations(tours, operations, { hasAttachment });
      return { operations, changes };
    },
  });
  if (answer.action === 'undo') return undoProposal(answer.reply);
  if (answer.action !== 'change') return { reply: answer.reply, proposal: null };
  return { reply: answer.reply, proposal: { type: 'change', operations: answer.operations, changes: answer.changes } };
}

function decodePhoto(photo) {
  const bytes = Buffer.from(String(photo?.base64 ?? ''), 'base64');
  if (bytes.length > MAX_PHOTO_BYTES) throw new TourError('Das Foto ist zu gross.');
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) throw new TourError('Das Foto konnte nicht gelesen werden.');
  return bytes;
}

function photoPath(photoHash) {
  return `/assets/uploads/tour-${photoHash}.jpg`;
}

const encodeTours = (data) => Buffer.from(`${JSON.stringify(data, null, 2)}\n`).toString('base64');

async function buildCommit(proposal, photo, parent) {
  if (proposal?.type === 'undo') {
    const latest = await latestToursCommit();
    if (!latest || latest.sha !== proposal.commit || !latest.message.startsWith(COMMIT_PREFIX) || !latest.parent) {
      throw new TourError('Inzwischen hat sich an den Touren etwas geändert. Bitte sag nochmals, was rückgängig gemacht werden soll.');
    }
    const previous = await readToursAt(latest.parent);
    return {
      message: `${COMMIT_PREFIX}letzte Änderung rückgängig gemacht`,
      files: [{ path: TOURS_PATH, base64: encodeTours(previous) }],
    };
  }
  if (proposal?.type !== 'change') throw new TourError('Unbekannter Vorschlag.');

  const photoBytes = photo ? decodePhoto(photo) : null;
  const path = photoBytes ? photoPath(hash(photoBytes).toString('hex').slice(0, 16)) : undefined;
  const data = await readToursAt(parent);
  const { tours, changes } = applyOperations(data.tours, proposal.operations, { attachmentPath: path, hasAttachment: Boolean(photoBytes) });
  const usesPhoto = proposal.operations.some((op) => op.useAttachment);
  const files = [{ path: TOURS_PATH, base64: encodeTours({ ...data, tours }) }];
  if (photoBytes && usesPhoto) files.push({ path: `public${path}`, base64: photoBytes.toString('base64') });
  return { message: `${COMMIT_PREFIX}${summarize(changes)}`, files };
}

async function publish(body) {
  for (let attempt = 0; ; attempt += 1) {
    const parent = await headCommit();
    const { message, files } = await buildCommit(body.proposal, body.photo, parent);
    try {
      return { commit: await commitFiles({ parent, message, files }) };
    } catch (e) {
      // Someone (e.g. the CMS) committed at the same moment: rebuild on top of that.
      if (e.status !== 422 || attempt >= 2) throw e;
    }
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'Nicht erlaubt.' });
  if (!isSameOrigin(req)) return send(res, 403, { error: 'Nicht erlaubt.' });
  const body = req.body && typeof req.body === 'object' ? req.body : {};

  if (!isConfigured()) return send(res, 200, { configured: false, loggedIn: false });
  if (body.action === 'status') return send(res, 200, { configured: true, loggedIn: isLoggedIn(req) });
  if (body.action === 'login') return login(req, res, body);
  if (!isLoggedIn(req)) return send(res, 401, { error: 'Bitte melde dich neu an.', loggedOut: true });

  try {
    if (body.action === 'logout') { setSession(res, '', 0); return send(res, 200, { loggedIn: false }); }
    if (body.action === 'propose') return send(res, 200, await propose(body));
    if (body.action === 'propose-undo') return send(res, 200, await undoProposal());
    if (body.action === 'publish') return send(res, 200, await publish(body));
    return send(res, 400, { error: 'Unbekannte Aktion.' });
  } catch (e) {
    if (e instanceof TourError) return send(res, 422, { error: e.message });
    console.error('chat error:', e.message);
    return send(res, 502, { error: 'Das hat gerade nicht geklappt. Es wurde nichts geändert. Bitte versuch es nochmals.' });
  }
}
