// Chat admin endpoint: POST { action, ... } from the /chat page.
// Requires env vars CHAT_PASSWORD (12+ characters), GEMINI_API_KEY and
// CHAT_GITHUB_TOKEN (set in the Vercel project; GEMINI_MODEL optionally puts another
// model first). BLOB_READ_WRITE_TOKEN enables large uploads (video, brochure PDF).
// Without the first three the page just says the chat isn't set up yet.
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { handleUpload } from '@vercel/blob/client';
import { applyOperations, COLLECTION_NAMES, ContentError, diffContent, isBlobUrl, summarize } from './_chat-content.js';
import { askGemini, GeminiBusy } from './_chat-gemini.js';
import { commitFiles, COMMIT_PREFIX, encodeContentFile, headCommit, latestDataCommit, readContentAt } from './_chat-github.js';

const COOKIE = 'vcc_chat';
const SESSION_SECONDS = 30 * 24 * 3600;
const MAX_FAILURES = 5;
const LOCK_MS = 10 * 60 * 1000;
const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;
const UPLOAD_TYPES = ['video/mp4', 'video/quicktime', 'video/webm', 'video/x-m4v', 'application/pdf'];
const ATTACHMENT_ID = /^datei\d{1,3}$/;
const ATTACHMENT_KINDS = ['image', 'video', 'pdf'];

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

const changedCollections = (a, b) => COLLECTION_NAMES.filter((name) => JSON.stringify(a[name]) !== JSON.stringify(b[name]));

async function undoProposal(reply) {
  const latest = await latestDataCommit();
  if (!latest || !latest.message.startsWith(COMMIT_PREFIX) || !latest.parent) {
    return { reply: 'Das kann ich nicht rückgängig machen: Die letzte Änderung kam nicht aus diesem Chat, sondern wurde im CMS gemacht.', proposal: null };
  }
  const [current, previous] = await Promise.all([readContentAt(), readContentAt(latest.parent)]);
  const changes = diffContent(current.content, previous.content);
  if (changes.length === 0) return { reply: 'Da gibt es nichts rückgängig zu machen.', proposal: null };
  return { reply: reply || 'So würde ich die letzte Änderung rückgängig machen:', proposal: { type: 'undo', commit: latest.sha, changes } };
}

// What the page says is attached. The files themselves only arrive on publishing.
function attachedFiles(list) {
  return (Array.isArray(list) ? list : [])
    .filter((a) => ATTACHMENT_ID.test(a?.id) && ATTACHMENT_KINDS.includes(a?.kind))
    .slice(0, 12)
    .map((a) => ({ id: a.id, kind: a.kind, name: String(a.name ?? 'Datei').replace(/\s+/g, ' ').slice(0, 120) }));
}

async function propose(body) {
  const messages = Array.isArray(body.messages) ? body.messages : [];
  if (messages.length === 0) throw new ContentError('Bitte schreib zuerst, was du ändern möchtest.');
  const attachments = attachedFiles(body.attachments);
  const preview = Object.fromEntries(attachments.map((a) => [a.id, { kind: a.kind, path: `(neue Datei: ${a.name})` }]));
  const { content } = await readContentAt();
  const answer = await askGemini({
    messages,
    content,
    attachments,
    validate: (operations) => {
      const { changes } = applyOperations(content, operations, { attachments: preview });
      return { operations, changes };
    },
  });
  if (answer.action === 'undo') return undoProposal(answer.reply);
  if (answer.action !== 'change') return { reply: answer.reply, proposal: null };
  return { reply: answer.reply, proposal: { type: 'change', operations: answer.operations, changes: answer.changes } };
}

function imageExtension(bytes) {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpg';
  if (bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  throw new ContentError('Dieses Bild konnte nicht gelesen werden.');
}

function usedAttachments(operations) {
  const used = new Set();
  for (const op of Array.isArray(operations) ? operations : []) {
    for (const value of Object.values(op?.fields || {})) {
      if (typeof value === 'string' && value.startsWith('@')) used.add(value.slice(1));
    }
  }
  return used;
}

// Images travel with the commit; video and PDF were already uploaded by the page.
function receiveFiles(list, used) {
  const attachments = {};
  const commit = [];
  for (const file of Array.isArray(list) ? list : []) {
    if (!used.has(file?.id) || !ATTACHMENT_KINDS.includes(file?.kind)) continue;
    if (file.kind === 'image') {
      const bytes = Buffer.from(String(file.base64 ?? ''), 'base64');
      if (bytes.length > MAX_IMAGE_BYTES) throw new ContentError('Dieses Bild ist zu gross.');
      const path = `/assets/uploads/chat-${hash(bytes).toString('hex').slice(0, 16)}.${imageExtension(bytes)}`;
      attachments[file.id] = { kind: 'image', path };
      commit.push({ path: `public${path}`, base64: bytes.toString('base64') });
    } else {
      if (!isBlobUrl(file.url)) throw new ContentError('Die Datei konnte nicht übernommen werden.');
      attachments[file.id] = { kind: file.kind, path: file.url };
    }
  }
  return { attachments, commit };
}

async function buildCommit(proposal, uploads, parent) {
  if (proposal?.type === 'undo') {
    const latest = await latestDataCommit();
    if (!latest || latest.sha !== proposal.commit || !latest.message.startsWith(COMMIT_PREFIX) || !latest.parent) {
      throw new ContentError('Inzwischen hat sich etwas geändert. Bitte sag nochmals, was rückgängig gemacht werden soll.');
    }
    const [current, previous] = await Promise.all([readContentAt(parent), readContentAt(latest.parent)]);
    return {
      message: `${COMMIT_PREFIX}letzte Änderung rückgängig gemacht`,
      files: changedCollections(current.content, previous.content).map((name) => encodeContentFile(name, previous.raw[name], previous.content[name])),
    };
  }
  if (proposal?.type !== 'change') throw new ContentError('Unbekannter Vorschlag.');

  const { attachments, commit } = receiveFiles(uploads, usedAttachments(proposal.operations));
  const { raw, content } = await readContentAt(parent);
  const { state, changes } = applyOperations(content, proposal.operations, { attachments });
  const files = changedCollections(content, state).map((name) => encodeContentFile(name, raw[name], state[name]));
  return { message: `${COMMIT_PREFIX}${summarize(changes)}`, files: [...files, ...commit] };
}

async function publish(body) {
  for (let attempt = 0; ; attempt += 1) {
    const parent = await headCommit();
    const { message, files } = await buildCommit(body.proposal, body.files, parent);
    try {
      return { commit: await commitFiles({ parent, message, files }) };
    } catch (e) {
      // Someone (e.g. the CMS) committed at the same moment: rebuild on top of that.
      if (e.status !== 422 || attempt >= 2) throw e;
    }
  }
}

// Hands the logged-in page a short-lived token to upload straight to Blob storage,
// because video and PDF don't fit through a function's 4.5 MB request limit.
function uploadToken(req, body) {
  return handleUpload({
    request: req,
    body,
    onBeforeGenerateToken: async () => ({ allowedContentTypes: UPLOAD_TYPES, maximumSizeInBytes: MAX_UPLOAD_BYTES, addRandomSuffix: true }),
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'Nicht erlaubt.' });
  if (!isSameOrigin(req)) return send(res, 403, { error: 'Nicht erlaubt.' });
  const body = req.body && typeof req.body === 'object' ? req.body : {};

  if (!isConfigured()) return send(res, 200, { configured: false, loggedIn: false });
  if (body.action === 'status') return send(res, 200, { configured: true, loggedIn: isLoggedIn(req), uploads: Boolean(process.env.BLOB_READ_WRITE_TOKEN) });
  if (body.action === 'login') return login(req, res, body);
  if (!isLoggedIn(req)) return send(res, 401, { error: 'Bitte melde dich neu an.', loggedOut: true });

  try {
    if (body.type === 'blob.generate-client-token') return send(res, 200, await uploadToken(req, body));
    if (body.action === 'logout') { setSession(res, '', 0); return send(res, 200, { loggedIn: false }); }
    if (body.action === 'propose') return send(res, 200, await propose(body));
    if (body.action === 'propose-undo') return send(res, 200, await undoProposal());
    if (body.action === 'publish') return send(res, 200, await publish(body));
    return send(res, 400, { error: 'Unbekannte Aktion.' });
  } catch (e) {
    if (e instanceof ContentError) return send(res, 422, { error: e.message });
    console.error('chat error:', e.message);
    if (e instanceof GeminiBusy) return send(res, 503, { error: 'Der KI-Dienst von Google ist gerade überlastet. Es wurde nichts geändert. Bitte versuch es in einer Minute nochmals.' });
    return send(res, 502, { error: 'Das hat gerade nicht geklappt. Es wurde nichts geändert. Bitte versuch es nochmals.' });
  }
}
