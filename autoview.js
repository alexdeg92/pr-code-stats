// "Auto-view tests" switch, shown in the line count badge on the Files changed page.
// Off by default. When on, test files are marked as Viewed, which collapses them.
// Turning it off un-marks only the files this switch marked, so manual choices are
// left alone, and a file the user un-marks afterwards is not marked again.
// Folders in the file tree that hold only test files are folded too.
//
// With a token, files are marked through GitHub's GraphQL API, which doesn't depend
// on the page's markup; the open page doesn't hear about it, so it reloads once.
// Without a token, or if the API fails, the page's own Viewed buttons are clicked.
// They are found by accessibility attributes, not GitHub's generated class names.
//
// Marked and skipped paths are saved per PR in storage.local, so both survive a reload.
// Uses `testPatterns` from content.js (same isolated world).

let autoView = false;
let hasToken = false;
let apiFailed = false;
let apiSynced = null; // PR key the API pass already ran for
const clickedAt = new Map(); // "owner/repo#n|path" clicked by us -> click time
let autoViewTimer = null;
const TICKED = 'autoViewed'; // { "owner/repo#n": [paths marked by us] }
const SKIPPED = 'autoViewSkipped'; // { "owner/repo#n": [paths the user un-marked after us] }
const store = { [TICKED]: {}, [SKIPPED]: {} }; // in-memory copy, so reads stay synchronous
const foldedByUs = new Set(); // tree folder paths we folded
const foldSkipped = new Set(); // folded by us, then reopened by the user
let missingButtonRuns = 0;

chrome.storage.sync.get('autoViewTests', (s) => {
  autoView = !!s.autoViewTests;
  scheduleAutoView();
});
chrome.storage.local.get(['token', TICKED, SKIPPED], (s) => {
  hasToken = !!s.token;
  store[TICKED] = s[TICKED] || {};
  store[SKIPPED] = s[SKIPPED] || {};
  scheduleAutoView();
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local') {
    if (changes.token) {
      hasToken = !!changes.token.newValue;
      apiFailed = false;
    }
    for (const name of [TICKED, SKIPPED]) if (changes[name]) store[name] = changes[name].newValue || {};
  }
  if (changes.autoViewTests) setAutoView(!!changes.autoViewTests.newValue);
});

function scheduleAutoView() {
  clearTimeout(autoViewTimer);
  autoViewTimer = setTimeout(runAutoView, 250);
}

new MutationObserver(scheduleAutoView).observe(document.documentElement, {
  childList: true,
  subtree: true,
  attributes: true,
  attributeFilter: ['aria-pressed', 'aria-expanded'],
});

function stored(name, key) {
  return store[name][key] || [];
}

// Memory is updated at once; storage writes are chained so several in one pass
// don't overwrite each other.
let storeChain = Promise.resolve();
function remember(name, key, path, add) {
  const update = (all) => {
    const paths = new Set(all[key] || []);
    if (add) paths.add(path);
    else paths.delete(path);
    if (paths.size) all[key] = [...paths];
    else delete all[key];
    return all;
  };
  update(store[name]);
  storeChain = storeChain.then(async () => {
    const all = (await chrome.storage.local.get(name))[name] || {};
    await chrome.storage.local.set({ [name]: update(all) });
  });
}

function useApi() {
  return hasToken && !apiFailed;
}

function prParts() {
  return location.pathname.match(/^\/([^/]+)\/([^/]+)\/pull\/(\d+)\/(changes|files)/);
}

function prKey() {
  const m = prParts();
  return m && `${m[1]}/${m[2]}#${m[3]}`;
}

function isTest(path) {
  return testPatterns.some((re) => re.test(path));
}

function send(msg) {
  return new Promise((resolve) =>
    chrome.runtime.sendMessage(msg, (res) =>
      resolve(res || { error: chrome.runtime.lastError?.message || 'no response' })
    )
  );
}

// GitHub can reload the page under us (new commits); don't loop if a pass keeps
// finding work, e.g. because GitHub ignores the mutation.
function reloadOnce() {
  const last = Number(sessionStorage.getItem('prcs-autoview-reload') || 0);
  if (Date.now() - last < 30_000) return;
  sessionStorage.setItem('prcs-autoview-reload', String(Date.now()));
  location.reload();
}

function failApi(err) {
  apiFailed = true;
  console.warn('[pr-code-stats] Auto-view: GitHub API failed, using the page instead.', err);
  scheduleAutoView();
}

// Each file's Viewed button is the only toggle button in its file header, and the
// header's h3 holds the path. The walk up stops at the first ancestor with an h3,
// which must hold this one toggle, or the button isn't a file's Viewed button.
function testFileHeaders() {
  const out = [];
  for (const btn of document.querySelectorAll('button[aria-pressed]')) {
    if (!/viewed/i.test(btn.textContent)) continue;
    let h = btn.parentElement;
    while (h && !h.querySelector('h3')) h = h.parentElement;
    if (!h || h.querySelectorAll('button[aria-pressed]').length !== 1) continue;
    const title = h.querySelector('h3 code') || h.querySelector('h3');
    const path = title.textContent.replace(/[\u200e\u200f]/g, '').trim();
    if (path && isTest(path)) out.push({ path, btn });
  }
  return out;
}

function runAutoView() {
  const key = prKey();
  if (!key) {
    document.querySelector('.prcs-autoview')?.remove();
    return;
  }
  renderSwitch();
  syncTestFolders();
  if (!autoView) return;
  if (useApi()) apiPass(key);
  else domPass(key);
}

async function apiPass(key) {
  if (apiSynced === key) return;
  apiSynced = key;
  const [, owner, repo, number] = prParts();
  const res = await send({ type: 'viewed-state', owner, repo, number });
  if (res.error) return failApi(res.error);

  const ticked = stored(TICKED, key);
  const skipped = stored(SKIPPED, key);
  const toMark = [];
  for (const { path, state } of res.files) {
    if (!isTest(path) || state === 'VIEWED' || skipped.includes(path)) continue;
    // UNVIEWED after we marked it: the user un-marked it. DISMISSED means new
    // commits changed it, so it gets marked again.
    if (state === 'UNVIEWED' && ticked.includes(path)) {
      remember(TICKED, key, path, false);
      remember(SKIPPED, key, path, true);
      continue;
    }
    toMark.push(path);
  }
  if (!toMark.length) return;

  const done = await send({ type: 'set-viewed', prId: res.id, paths: toMark, viewed: true });
  if (done.error) return failApi(done.error);
  for (const path of toMark) remember(TICKED, key, path, true);
  await storeChain;
  reloadOnce();
}

function domPass(key) {
  const headers = testFileHeaders();
  noticeMissingButtons(headers);
  for (const { path, btn } of headers) {
    const id = `${key}|${path}`;
    const pressed = btn.getAttribute('aria-pressed') === 'true';
    // Only a file clicked during this visit can have been un-marked by the user; one
    // marked on an earlier visit and now unpressed most likely got new commits. The
    // grace period covers GitHub's own update lag after our click.
    if (clickedAt.has(id) && !pressed && Date.now() - clickedAt.get(id) > 2000 && !clickQueue.includes(btn)) {
      clickedAt.delete(id);
      remember(TICKED, key, path, false);
      remember(SKIPPED, key, path, true);
      continue;
    }
    if (!pressed && !clickedAt.has(id) && !stored(SKIPPED, key).includes(path)) {
      clickedAt.set(id, Date.now());
      remember(TICKED, key, path, true);
      queueClick(btn);
    }
  }
}

// When the file tree lists files but no Viewed button is found, GitHub most likely
// changed the page again; say so once instead of failing silently.
function noticeMissingButtons(headers) {
  const anyButton = headers.length || [...document.querySelectorAll('button[aria-pressed]')].some((b) => /viewed/i.test(b.textContent));
  const hasFiles = document.querySelector('[role="treeitem"]');
  missingButtonRuns = !anyButton && hasFiles ? missingButtonRuns + 1 : 0;
  if (missingButtonRuns === 5) {
    console.warn('[pr-code-stats] Auto-view: no Viewed buttons found on this page. Setting a GitHub token in the options makes Auto-view use the API instead.');
  }
}

// GitHub drops some of the requests when many Viewed buttons are clicked in the
// same tick, so clicks go one at a time, each waiting for the button to flip.
const clickQueue = [];
let clicking = false;
function queueClick(btn) {
  if (!clickQueue.includes(btn)) clickQueue.push(btn);
  if (!clicking) drainClicks();
}
async function drainClicks() {
  clicking = true;
  while (clickQueue.length) {
    const btn = clickQueue[0];
    if (btn.isConnected) {
      const before = btn.getAttribute('aria-pressed');
      btn.click();
      for (let i = 0; i < 20 && btn.getAttribute('aria-pressed') === before; i++) await sleep(50);
      await sleep(250);
    }
    clickQueue.shift();
  }
  clicking = false;
}
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function setAutoView(on) {
  if (on === autoView) return;
  autoView = on;
  apiSynced = null;
  clickQueue.length = 0;
  foldSkipped.clear();
  // A fresh start: files the user un-marked may be marked again.
  store[SKIPPED] = {};
  chrome.storage.local.remove(SKIPPED);

  if (!on) {
    for (const item of treeFolders()) {
      if (foldedByUs.delete(item.id) && item.getAttribute('aria-expanded') === 'false') toggleFolder(item);
    }
    const key = prKey();
    const ours = key ? stored(TICKED, key) : [];
    if (ours.length && useApi()) {
      const [, owner, repo, number] = prParts();
      const res = await send({ type: 'viewed-state', owner, repo, number });
      const done = !res.error && (await send({ type: 'set-viewed', prId: res.id, paths: ours, viewed: false }));
      if (done && !done.error) {
        for (const path of ours) remember(TICKED, key, path, false);
        await storeChain;
        return reloadOnce();
      }
      failApi(res.error || done.error);
    }
    for (const { path, btn } of testFileHeaders()) {
      if (ours.includes(path) && btn.getAttribute('aria-pressed') === 'true') queueClick(btn);
    }
    for (const path of ours) remember(TICKED, key, path, false);
    clickedAt.clear();
  }
  scheduleAutoView();
}

function treeFolders() {
  return [...document.querySelectorAll('[role="treeitem"][aria-expanded]')];
}

function toggleFolder(item) {
  item.querySelector('.PRIVATE_TreeView-item-toggle')?.click();
}

// A folder is a test folder when every file under it is a test file. Only the
// topmost such folder is folded, so `hooks/__tests__` folds but `hooks` stays open.
function syncTestFolders() {
  const folders = treeFolders();
  if (!folders.length) return;
  const files = [...document.querySelectorAll('[role="treeitem"]:not([aria-expanded])')].map((f) => f.id);
  const isTestFolder = (id) => {
    const under = files.filter((f) => f.startsWith(id + '/'));
    return under.length > 0 && under.every(isTest);
  };

  for (const item of folders) {
    const id = item.id;
    const open = item.getAttribute('aria-expanded') === 'true';
    if (foldedByUs.has(id) && open) {
      foldedByUs.delete(id);
      foldSkipped.add(id);
    }
    if (!autoView || !open || foldSkipped.has(id) || foldedByUs.has(id)) continue;
    const parent = item.parentElement?.closest('[role="treeitem"]');
    if (isTestFolder(id) && !(parent && isTestFolder(parent.id))) {
      foldedByUs.add(id);
      toggleFolder(item);
    }
  }
}

// The switch lives in our own line count badge (content.js), which is found by its
// text and stable utility classes, not by GitHub's generated class names.
function renderSwitch() {
  const badge = document.querySelector('.prcs');
  if (!badge) return;

  let sw = badge.querySelector(':scope > .prcs-autoview');
  if (!sw) {
    sw = document.createElement('button');
    sw.type = 'button';
    sw.className = 'prcs-autoview';
    sw.setAttribute('role', 'switch');
    sw.innerHTML = '<span class="prcs-autoview-track"><span class="prcs-autoview-thumb"></span></span><span>Auto-view tests</span>';
    sw.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const on = !autoView;
      chrome.storage.sync.set({ autoViewTests: on });
      setAutoView(on);
    });
    badge.append(sw);
  }

  const n = testFileHeaders().length;
  const state = String(autoView);
  if (sw.getAttribute('aria-checked') !== state) sw.setAttribute('aria-checked', state);
  const via = useApi() ? ' through the GitHub API' : '';
  const title = autoView
    ? `Test files are marked as Viewed automatically${via} (${n} on this page). Click to turn off.`
    : `Mark test files as Viewed automatically${via} (${n} on this page).`;
  if (sw.title !== title) sw.title = title;
}
