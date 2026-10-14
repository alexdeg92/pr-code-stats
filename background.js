// Fetches per-file line counts for a PR, and reads or sets the Viewed state of files
// through GitHub's GraphQL API when a token is set. The page itself can't fetch the
// counts: the .diff URL redirects to patch-diff.githubusercontent.com, which CORS
// blocks for page scripts.

const CACHE_MS = 60_000;
const cache = new Map();

const handlers = {
  'pr-files': (m) => getFiles(m.owner, m.repo, m.number).then((files) => ({ files })),
  'viewed-state': (m) => viewedState(m.owner, m.repo, m.number),
  'set-viewed': (m) => setViewed(m.prId, m.paths, m.viewed).then(() => ({})),
};

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  const handler = handlers[msg?.type];
  if (!handler) return;
  handler(msg)
    .then(sendResponse)
    .catch((err) => sendResponse({ error: String(err?.message || err) }));
  return true;
});

async function getFiles(owner, repo, number) {
  const key = `${owner}/${repo}#${number}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.files;

  // Each source can fail on its own (blocked redirect, 503 on big repos, expired
  // token, private repo without a token), so try them in turn until one works.
  // Token stays on this device (local, not sync).
  const { token } = await chrome.storage.local.get('token');
  const sources = [
    token && ['API with token', () => fromApi(owner, repo, number, token)],
    ['diff', () => fromDiff(owner, repo, number)],
    ['public API', () => fromApi(owner, repo, number, null)],
  ].filter(Boolean);

  const errors = [];
  for (const [name, load] of sources) {
    try {
      const files = await load();
      cache.set(key, { at: Date.now(), files });
      return files;
    } catch (err) {
      errors.push(`${name}: ${err?.message || err}`);
    }
  }
  throw new Error(errors.join(' | '));
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
    for (const f of batch) {
      // GitHub leaves out the patch of very large files; those can't be checked for comments.
      const counted = f.patch ? countLines(f.filename, f.patch.split('\n')) : null;
      files.push({ path: f.filename, add: f.additions, del: f.deletions, withoutComments: counted?.withoutComments });
    }
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
  let path = null;
  let lines = [];
  const flush = () => path && files.push({ path, ...countLines(path, lines) });
  for (const line of text.split('\n')) {
    if (line.startsWith('diff --git ')) {
      flush();
      const m = line.match(/ b\/(.*)$/);
      path = m ? m[1] : line;
      lines = [];
    } else if (path) {
      lines.push(line);
    }
  }
  flush();
  return files;
}

// Comment syntax by file type: `line` matches a whole-line comment, `blocks` are
// open/close pairs. Unknown file types only lose their blank lines.
const SYNTAX = [
  {
    ext: /\.([cm]?[jt]sx?|c|h|cc|cpp|cxx|hpp|cs|java|kt|kts|swift|go|rs|scala|dart|groovy|gradle|proto|jsonc|s?css|less)$/i,
    line: /^\/\//,
    blocks: [['/*', '*/']],
  },
  { ext: /\.(vue|svelte|astro)$/i, line: /^\/\//, blocks: [['/*', '*/'], ['<!--', '-->']] },
  { ext: /\.php$/i, line: /^(\/\/|#(?!\[))/, blocks: [['/*', '*/']] },
  {
    ext: /\.(py|rb|sh|bash|zsh|fish|ya?ml|toml|r|pl|ex|exs|tf|ini|cfg|conf|mk|cmake)$|(^|\/)(Dockerfile|Makefile|Gemfile|\.gitignore)$/i,
    line: /^#/,
  },
  { ext: /\.(sql|lua|hs|elm)$/i, line: /^--/, blocks: [['/*', '*/']] },
  { ext: /\.(html?|xml|svg|mdx?|markdown)$/i, blocks: [['<!--', '-->']] },
];

// Counts the +/- lines of one file's diff, in total and without comments or blank
// lines. Block comments are tracked separately for the old and new side; a hunk
// that starts inside a block comment is caught by its usual ` * ` lines.
function countLines(path, lines) {
  const syntax = SYNTAX.find((s) => s.ext.test(path));
  const counts = { add: 0, del: 0, withoutComments: { add: 0, del: 0 } };
  let oldSide = { close: null };
  let newSide = { close: null };
  let inHunk = false;
  for (const line of lines) {
    if (line.startsWith('@@')) {
      inHunk = true;
      oldSide = { close: null };
      newSide = { close: null };
      continue;
    }
    if (!inHunk) continue;
    const text = line.slice(1);
    if (line[0] === '+') {
      counts.add++;
      if (!isNoise(text, syntax, newSide)) counts.withoutComments.add++;
    } else if (line[0] === '-') {
      counts.del++;
      if (!isNoise(text, syntax, oldSide)) counts.withoutComments.del++;
    } else if (line[0] === ' ') {
      isNoise(text, syntax, oldSide);
      isNoise(text, syntax, newSide);
    }
  }
  return counts;
}

// True for a blank or comment-only line. A line with code and a trailing comment is code.
// Block comments opened mid-line are ignored: globs like `src/**/*.ts` look the same.
function isNoise(text, syntax, side) {
  const t = text.trim();
  if (side.close) {
    const end = t.indexOf(side.close);
    if (end === -1) return true;
    const rest = t.slice(end + side.close.length).trim();
    side.close = null;
    return !rest;
  }
  if (!t) return true;
  if (!syntax) return false;
  if (syntax.line?.test(t)) return true;
  for (const [open, close] of syntax.blocks || []) {
    if (!t.startsWith(open)) continue;
    const end = t.indexOf(close, open.length);
    if (end === -1) {
      side.close = close;
      return true;
    }
    return !t.slice(end + close.length).trim();
  }
  return !!syntax.blocks?.some(([open]) => open === '/*') && /^\*(\s|\/|$)/.test(t);
}

// GraphQL always needs a token; without one the content script clicks the page instead.
async function graphql(query, variables) {
  const { token } = await chrome.storage.local.get('token');
  if (!token) throw new Error('no token');
  const res = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`GraphQL ${res.status}`);
  const body = await res.json();
  if (body.errors?.length) throw new Error(body.errors.map((e) => e.message).join('; '));
  return body.data;
}

const VIEWED_QUERY = `query($owner: String!, $repo: String!, $number: Int!, $after: String) {
  repository(owner: $owner, name: $repo) {
    pullRequest(number: $number) {
      id
      files(first: 100, after: $after) {
        nodes { path viewerViewedState }
        pageInfo { hasNextPage endCursor }
      }
    }
  }
}`;

async function viewedState(owner, repo, number) {
  const files = [];
  let id = null;
  let after = null;
  for (let page = 0; page < 30; page++) {
    const data = await graphql(VIEWED_QUERY, { owner, repo, number: Number(number), after });
    const pr = data.repository?.pullRequest;
    if (!pr) throw new Error('pull request not found');
    id = pr.id;
    for (const f of pr.files.nodes) files.push({ path: f.path, state: f.viewerViewedState });
    if (!pr.files.pageInfo.hasNextPage) break;
    after = pr.files.pageInfo.endCursor;
  }
  return { id, files };
}

// One request per 50 files: each mutation in the document gets its own alias.
async function setViewed(prId, paths, viewed) {
  const op = viewed ? 'markFileAsViewed' : 'unmarkFileAsViewed';
  for (let i = 0; i < paths.length; i += 50) {
    const chunk = paths.slice(i, i + 50);
    const vars = { pr: prId };
    const decls = chunk.map((_, j) => `$p${j}: String!`).join(', ');
    const fields = chunk.map((path, j) => {
      vars[`p${j}`] = path;
      return `m${j}: ${op}(input: { pullRequestId: $pr, path: $p${j} }) { clientMutationId }`;
    });
    await graphql(`mutation($pr: ID!, ${decls}) { ${fields.join(' ')} }`, vars);
  }
}
