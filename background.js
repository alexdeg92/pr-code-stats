// Fetches per-file line counts for a PR. The page itself can't do this: the .diff
// URL redirects to patch-diff.githubusercontent.com, which CORS blocks for page scripts.

const CACHE_MS = 60_000;
const cache = new Map();

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type !== 'pr-files') return;
  getFiles(msg.owner, msg.repo, msg.number)
    .then((files) => sendResponse({ files }))
    .catch((err) => sendResponse({ error: String(err?.message || err) }));
  return true;
});

async function getFiles(owner, repo, number) {
  const key = `${owner}/${repo}#${number}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.files;

  // Token stays on this device (local, not sync).
  const { token } = await chrome.storage.local.get('token');
  let files;
  if (token) {
    files = await fromApi(owner, repo, number, token);
  } else {
    // The .diff endpoint sometimes 503s on large repos; the anonymous API
    // covers public repos in that case.
    try {
      files = await fromDiff(owner, repo, number);
    } catch (diffErr) {
      files = await fromApi(owner, repo, number, null).catch(() => {
        throw diffErr;
      });
    }
  }
  cache.set(key, { at: Date.now(), files });
  return files;
}

async function fromApi(owner, repo, number, token) {
  const files = [];
  for (let page = 1; page <= 30; page++) {
    const res = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/pulls/${number}/files?per_page=100&page=${page}`,
      {
        headers: {
          Accept: 'application/vnd.github+json',
          ...(token && { Authorization: `Bearer ${token}` }),
        },
      }
    );
    if (!res.ok) throw new Error(`GitHub API ${res.status}`);
    const batch = await res.json();
    for (const f of batch) files.push({ path: f.filename, add: f.additions, del: f.deletions });
    if (batch.length < 100) break;
  }
  return files;
}

// Uses the browser's GitHub session, so private repos work without a token.
async function fromDiff(owner, repo, number) {
  const res = await fetch(`https://github.com/${owner}/${repo}/pull/${number}.diff`, {
    credentials: 'include',
  });
  if (!res.ok) throw new Error(`diff ${res.status}`);
  return parseDiff(await res.text());
}

function parseDiff(text) {
  const files = [];
  let cur = null;
  let inHunk = false;
  for (const line of text.split('\n')) {
    if (line.startsWith('diff --git ')) {
      const m = line.match(/ b\/(.*)$/);
      cur = { path: m ? m[1] : line, add: 0, del: 0 };
      files.push(cur);
      inHunk = false;
    } else if (!cur) {
      continue;
    } else if (line.startsWith('@@')) {
      inHunk = true;
    } else if (inHunk && line[0] === '+') {
      cur.add++;
    } else if (inHunk && line[0] === '-') {
      cur.del++;
    }
  }
  return files;
}
