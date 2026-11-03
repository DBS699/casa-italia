// Reads and commits the content files through the GitHub API. Commits are created
// without an explicit author, so they count as the token's owner — Vercel's Hobby
// plan only deploys a private repo's commits when they come from the project owner.
import { COLLECTIONS, COLLECTION_NAMES } from './_chat-content.js';

const REPO = 'DBS699/casa-italia';
const BRANCH = 'main';
export const COMMIT_PREFIX = 'Chat: ';

async function gh(path, options = {}) {
  const r = await fetch(`https://api.github.com/repos/${REPO}${path}`, {
    ...options,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${process.env.CHAT_GITHUB_TOKEN}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
      'User-Agent': 'casa-italia-chat',
    },
    signal: AbortSignal.timeout(20000),
  });
  if (!r.ok) {
    const error = new Error(`GitHub ${r.status} on ${path.split('?')[0]}`);
    error.status = r.status;
    throw error;
  }
  return r.json();
}

async function readFileAt(path, ref) {
  const file = await gh(`/contents/${path}?ref=${encodeURIComponent(ref)}`);
  return JSON.parse(Buffer.from(file.content, 'base64').toString('utf8'));
}

// All content files at a commit: `raw` holds each file as stored (so keys the chat
// doesn't know survive), `content` the part the chat works with.
export async function readContentAt(ref = BRANCH) {
  const files = await Promise.all(COLLECTION_NAMES.map((name) => readFileAt(COLLECTIONS[name].file, ref)));
  const raw = {};
  const content = {};
  COLLECTION_NAMES.forEach((name, i) => {
    const { listKey } = COLLECTIONS[name];
    raw[name] = files[i];
    content[name] = listKey ? files[i][listKey] : files[i];
    if (listKey && !Array.isArray(content[name])) throw new Error(`${COLLECTIONS[name].file} has no list ${listKey}`);
  });
  return { raw, content };
}

export function encodeContentFile(name, raw, value) {
  const { listKey } = COLLECTIONS[name];
  const data = listKey ? { ...raw, [listKey]: value } : { ...raw, ...value };
  return { path: COLLECTIONS[name].file, base64: Buffer.from(`${JSON.stringify(data, null, 2)}\n`).toString('base64') };
}

export async function headCommit() {
  const ref = await gh(`/git/ref/heads/${BRANCH}`);
  return ref.object.sha;
}

// The newest commit that touched the data folder — only that one can be undone safely.
export async function latestDataCommit() {
  const commits = await gh(`/commits?sha=${BRANCH}&path=${encodeURIComponent('src/data')}&per_page=1`);
  const commit = commits[0];
  if (!commit) return null;
  return { sha: commit.sha, message: commit.commit.message, parent: commit.parents[0]?.sha };
}

// One atomic commit, so an entry and its photo always arrive (and deploy) together.
// Fails with status 422 when main moved in the meantime; the caller starts over.
export async function commitFiles({ parent, message, files }) {
  const base = await gh(`/git/commits/${parent}`);
  const tree = await Promise.all(files.map(async (file) => {
    const blob = await gh('/git/blobs', { method: 'POST', body: JSON.stringify({ content: file.base64, encoding: 'base64' }) });
    return { path: file.path, mode: '100644', type: 'blob', sha: blob.sha };
  }));
  const newTree = await gh('/git/trees', { method: 'POST', body: JSON.stringify({ base_tree: base.tree.sha, tree }) });
  const commit = await gh('/git/commits', { method: 'POST', body: JSON.stringify({ message, tree: newTree.sha, parents: [parent] }) });
  await gh(`/git/refs/heads/${BRANCH}`, { method: 'PATCH', body: JSON.stringify({ sha: commit.sha, force: false }) });
  return commit.sha;
}
