// Replaces the "+947 -77" in the PR header with the count excluding test files,
// plus a toggle to show the full count. GitHub is a SPA and re-renders the header,
// so a MutationObserver re-applies the badge whenever it gets wiped.

const PR_PATH = /^\/([^/]+)\/([^/]+)\/pull\/(\d+)(\/|$)/;
const HIDDEN = 'data-prcs-hidden';

let includeTests = false;
let testPatterns = compileTestPatterns(DEFAULT_TEST_PATTERNS);
let stats = null; // { key, code: {add, del, files}, tests: {add, del, files} }
let loadingKey = null;
let failedKey = null; // don't retry on every DOM mutation after an error

chrome.storage.sync.get(['includeTests', 'patterns'], (s) => {
  includeTests = !!s.includeTests;
  if (s.patterns) testPatterns = compileTestPatterns(s.patterns);
  schedule();
});

chrome.storage.onChanged.addListener((changes) => {
  if (changes.patterns) {
    testPatterns = compileTestPatterns(changes.patterns.newValue || DEFAULT_TEST_PATTERNS);
    stats = null;
  }
  if (changes.includeTests) includeTests = !!changes.includeTests.newValue;
  schedule();
});

let timer = null;
function schedule() {
  clearTimeout(timer);
  timer = setTimeout(apply, 150);
}
new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });

function findHeaderStat() {
  const scope = document.querySelector('[class*="PullRequestHeader"]') || document;
  for (const add of scope.querySelectorAll('.fgColor-success, .color-fg-success')) {
    if (add.closest('.prcs')) continue;
    if (!/^\+[\d,]+$/.test(add.textContent.trim())) continue;
    const del = add.nextElementSibling;
    if (del && /^[-−][\d,]+$/.test(del.textContent.trim())) return { add, del };
  }
  return null;
}

function apply() {
  const m = location.pathname.match(PR_PATH);
  if (!m) return;
  const [, owner, repo, number] = m;
  const key = `${owner}/${repo}#${number}`;

  const target = findHeaderStat();
  if (!target) return;

  if (!stats || stats.key !== key) {
    if (loadingKey !== key && failedKey !== key) load(owner, repo, number, key);
    return;
  }

  const shown = includeTests
    ? { add: stats.code.add + stats.tests.add, del: stats.code.del + stats.tests.del }
    : stats.code;
  const state = `${key}|${includeTests}|${shown.add}|${shown.del}`;

  let badge = target.add.parentElement.querySelector(':scope > .prcs');
  if (badge && badge.dataset.state === state && target.add.hasAttribute(HIDDEN)) return;

  if (!badge) {
    badge = document.createElement('span');
    badge.className = 'prcs';
    target.add.before(badge);
  }
  badge.dataset.state = state;
  target.add.setAttribute(HIDDEN, '');
  target.del.setAttribute(HIDDEN, '');

  const t = stats.tests;
  const pct = stats.code.add + t.add ? Math.round((t.add / (stats.code.add + t.add)) * 100) : 0;
  badge.innerHTML = '';
  badge.append(
    span(`+${fmt(shown.add)}`, `${target.add.className}`),
    span(`-${fmt(shown.del)}`, `${target.del.className}`)
  );
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'prcs-toggle' + (includeTests ? ' prcs-on' : '');
  btn.textContent = includeTests ? 'incl. tests' : 'excl. tests';
  btn.title =
    `Code: +${fmt(stats.code.add)} -${fmt(stats.code.del)} in ${files(stats.code.files)}\n` +
    `Tests: +${fmt(t.add)} -${fmt(t.del)} in ${files(t.files)} (${pct}% of added lines)\n` +
    `Click to ${includeTests ? 'exclude' : 'include'} tests`;
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    includeTests = !includeTests;
    chrome.storage.sync.set({ includeTests });
    apply();
  });
  badge.append(btn);
}

async function load(owner, repo, number, key) {
  loadingKey = key;
  let files;
  const errors = [];
  try {
    files = await fromChangesPage(owner, repo, number);
  } catch (err) {
    errors.push(`changes page: ${err.message}`);
    // Fallback: the background worker downloads the .diff or asks the API.
    const res = await new Promise((resolve) =>
      chrome.runtime.sendMessage({ type: 'pr-files', owner, repo, number }, resolve)
    );
    if (res?.files) files = res.files;
    else errors.push(`diff: ${res?.error || chrome.runtime.lastError?.message || 'no response'}`);
  }
  loadingKey = null;
  if (!files) {
    failedKey = key;
    console.warn('[pr-code-stats] could not load line counts.', errors.join(' | '));
    return;
  }

  const code = { add: 0, del: 0, files: 0 };
  const tests = { add: 0, del: 0, files: 0 };
  for (const f of files) {
    const bucket = testPatterns.some((re) => re.test(f.path)) ? tests : code;
    bucket.add += f.add;
    bucket.del += f.del;
    bucket.files++;
  }
  stats = { key, code, tests };
  apply();
}

// GitHub's Files changed page embeds every file's line counts as JSON. Fetching it
// is same-origin with the page, so no redirect, CORS or blocker can get in the way.
async function fromChangesPage(owner, repo, number) {
  const res = await fetch(`/${owner}/${repo}/pull/${number}/changes`, { credentials: 'same-origin' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();
  const m = html.match(/<script type="application\/json" data-target="react-app\.embeddedData">([\s\S]*?)<\/script>/);
  if (!m) throw new Error('no embedded data');
  const summaries = findKey(JSON.parse(m[1]), 'diffSummaries');
  if (!Array.isArray(summaries) || !summaries.length) throw new Error('no diffSummaries');

  const files = summaries.map((f) => ({ path: f.path, add: f.linesAdded, del: f.linesDeleted }));
  // Very large PRs may embed only part of the list; the header total tells us.
  const header = findHeaderStat();
  const expected = header && Number(header.add.textContent.replace(/[^\d]/g, ''));
  const got = files.reduce((n, f) => n + f.add, 0);
  if (expected && got !== expected) throw new Error(`partial list (${got} of ${expected} added lines)`);
  return files;
}

function findKey(obj, key) {
  if (!obj || typeof obj !== 'object') return undefined;
  if (key in obj) return obj[key];
  for (const v of Object.values(obj)) {
    const hit = findKey(v, key);
    if (hit !== undefined) return hit;
  }
  return undefined;
}

function span(text, className) {
  const s = document.createElement('span');
  s.className = className;
  s.textContent = text;
  return s;
}

function files(n) {
  return `${n} file${n === 1 ? '' : 's'}`;
}

function fmt(n) {
  return n.toLocaleString('en-US');
}
