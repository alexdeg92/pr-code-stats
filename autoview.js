// "Auto-view tests" switch in the Files changed toolbar. Off by default. When on,
// test files get GitHub's Viewed box ticked, which collapses them. Turning it off
// un-ticks only the files this switch ticked, so manual choices are left alone.
// Folders in the file tree that hold only test files are folded too.
// Ticked paths are saved per PR in storage.local so that still works after a reload.
// Uses `testPatterns` from content.js (same isolated world).

let autoView = false;
const autoViewed = new Map(); // "owner/repo#n|path" ticked by us -> click time
const skipped = new Set(); // ticked by us, then un-ticked by the user: don't fight them
let autoViewTimer = null;
const STORE_KEY = 'autoViewed';
const foldedByUs = new Set(); // tree folder paths we folded
const foldSkipped = new Set(); // folded by us, then reopened by the user

chrome.storage.sync.get('autoViewTests', (s) => {
  autoView = !!s.autoViewTests;
  scheduleAutoView();
});
chrome.storage.onChanged.addListener((changes) => {
  if (!changes.autoViewTests) return;
  setAutoView(!!changes.autoViewTests.newValue);
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
    const btn = clickQueue.shift();
    if (!btn.isConnected) continue;
    const before = btn.getAttribute('aria-pressed');
    btn.click();
    for (let i = 0; i < 20 && btn.getAttribute('aria-pressed') === before; i++) await sleep(50);
    await sleep(250);
  }
  clicking = false;
}
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function prKey() {
  const m = location.pathname.match(/^\/([^/]+)\/([^/]+)\/pull\/(\d+)\/(changes|files)/);
  return m && `${m[1]}/${m[2]}#${m[3]}`;
}

function testFileHeaders() {
  const out = [];
  for (const h of document.querySelectorAll('[class*="DiffFileHeader-module__diff-file-header"]')) {
    const path = h.querySelector('h3 code')?.textContent.replace(/‎/g, '').trim();
    const btn = h.querySelector('button[class*="MarkAsViewedButton"]');
    if (path && btn && testPatterns.some((re) => re.test(path))) out.push({ path, btn });
  }
  return out;
}

function runAutoView() {
  const key = prKey();
  if (!key) return;
  renderSwitch();
  syncTestFolders();

  for (const { path, btn } of testFileHeaders()) {
    const id = `${key}|${path}`;
    const pressed = btn.getAttribute('aria-pressed') === 'true';
    if (autoViewed.has(id) && !pressed && Date.now() - autoViewed.get(id) > 2000) {
      // User un-ticked a file we ticked (the grace period covers GitHub's own update lag).
      autoViewed.delete(id);
      skipped.add(id);
      rememberTicked(key, path, false);
    }
    if (autoView && !pressed && !skipped.has(id) && !autoViewed.has(id)) {
      autoViewed.set(id, Date.now());
      rememberTicked(key, path, true);
      queueClick(btn);
    }
  }
}

async function setAutoView(on) {
  if (on === autoView) return;
  autoView = on;
  skipped.clear();
  foldSkipped.clear();
  clickQueue.length = 0;
  if (!on) {
    for (const item of treeFolders()) {
      if (foldedByUs.delete(item.id) && item.getAttribute('aria-expanded') === 'false') toggleFolder(item);
    }
    const key = prKey();
    const stored = key ? await getTicked(key) : [];
    for (const { path, btn } of testFileHeaders()) {
      const id = `${key}|${path}`;
      const ours = autoViewed.delete(id) || stored.includes(path);
      if (ours && btn.getAttribute('aria-pressed') === 'true') queueClick(btn);
    }
    if (key) for (const path of stored) rememberTicked(key, path, false);
  }
  scheduleAutoView();
}

function getTicked(key) {
  return new Promise((resolve) =>
    chrome.storage.local.get(STORE_KEY, (s) => resolve((s[STORE_KEY] || {})[key] || []))
  );
}

// Writes are chained so several ticks in one pass don't overwrite each other.
let storeChain = Promise.resolve();
function rememberTicked(key, path, add) {
  storeChain = storeChain.then(async () => {
    const all = (await chrome.storage.local.get(STORE_KEY))[STORE_KEY] || {};
    const paths = new Set(all[key] || []);
    if (add) paths.add(path);
    else paths.delete(path);
    if (paths.size) all[key] = [...paths];
    else delete all[key];
    await chrome.storage.local.set({ [STORE_KEY]: all });
  });
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
    return under.length > 0 && under.every((f) => testPatterns.some((re) => re.test(f)));
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

function renderSwitch() {
  const progress = document.querySelector('[class*="ViewedFileProgress-module__ProgressContainer"]');
  const anchor = progress?.parentElement;
  if (!anchor) return;

  let sw = anchor.parentElement.querySelector(':scope > .prcs-autoview');
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
    anchor.before(sw);
  }

  const n = testFileHeaders().length;
  const state = String(autoView);
  if (sw.getAttribute('aria-checked') !== state) sw.setAttribute('aria-checked', state);
  const title = autoView
    ? `Test files are marked as Viewed automatically (${n} on this page). Click to turn off.`
    : `Mark test files as Viewed automatically (${n} on this page).`;
  if (sw.title !== title) sw.title = title;
}
