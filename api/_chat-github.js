// Reads and commits tours.json through the GitHub API. Commits are created without
// an explicit author, so they count as the token's owner — Vercel's Hobby plan only
// deploys a private repo's commits when they come from the project owner.
const REPO = 'DBS699/casa-italia';
const BRANCH = 'main';
export const TOURS_PATH = 'src/data/tours.json';
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
    signal: AbortSignal.timeout(15000),
  });
  if (!r.ok) {
    const error = new Error(`GitHub ${r.status} on ${path.split('?')[0]}`);
    error.status = r.status;
    throw error;
  }
  return r.json();
}

export async function readToursAt(ref = BRANCH) {
  const file = await gh(`/contents/${TOURS_PATH}?ref=${encodeURIComponent(ref)}`);
  const data = JSON.parse(Buffer.from(file.content, 'base64').toString('utf8'));
  if (!Array.isArray(data.tours)) throw new Error('tours.json has no tours list');
  return data;
}

export async function headCommit() {
  const ref = await gh(`/git/ref/heads/${BRANCH}`);
  return ref.object.sha;
}

// The newest commit that touched tours.json — only that one can be undone safely.
export async function latestToursCommit() {
  const commits = await gh(`/commits?sha=${BRANCH}&path=${encodeURIComponent(TOURS_PATH)}&per_page=1`);
  const commit = commits[0];
  if (!commit) return null;
  return { sha: commit.sha, message: commit.commit.message, parent: commit.parents[0]?.sha };
}

// One atomic commit, so a tour and its photo always arrive (and deploy) together.
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
