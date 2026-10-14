// Everything saves as it changes: switches through bindSwitches, patterns and the
// token after a short pause in typing.

const patternsEl = document.getElementById('patterns');
const patternErrorEl = document.getElementById('pattern-error');
const tokenEl = document.getElementById('token');
const statusEl = document.getElementById('status');

// The example pull request in the preview: added and removed lines per part.
const EXAMPLE = { code: [180, 40], comments: [46, 9], docs: [109, 6], tests: [612, 22] };

function setting(name) {
  return settingValue(document.querySelector(`input[data-setting="${name}"]`));
}

function renderPreview() {
  const counted = {
    code: true,
    comments: !setting('excludeComments'),
    docs: true,
    tests: setting('includeTests'),
  };
  let add = 0;
  let del = 0;
  for (const [part, [a, d]] of Object.entries(EXAMPLE)) {
    if (counted[part]) {
      add += a;
      del += d;
    }
    for (const el of document.querySelectorAll(`[data-part="${part}"]`)) el.classList.toggle('is-out', !counted[part]);
    document.querySelector(`.pv-legend [data-part="${part}"] .pv-state`).textContent = !counted[part]
      ? 'left out'
      : part === 'docs'
        ? 'counted, flagged'
        : 'counted';
  }
  document.getElementById('pv-add').textContent = `+${add}`;
  document.getElementById('pv-del').textContent = `-${del}`;
  const toggle = document.getElementById('pv-toggle');
  toggle.textContent = countLabel(counted.tests, !counted.comments);
  toggle.classList.toggle('is-on', counted.tests);
}

let statusTimer = null;
function showSaved() {
  statusEl.textContent = 'Saved';
  statusEl.classList.add('is-saved');
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => {
    statusEl.textContent = 'Changes save automatically';
    statusEl.classList.remove('is-saved');
  }, 1500);
}

function debounce(fn, ms) {
  let timer = null;
  return () => {
    clearTimeout(timer);
    timer = setTimeout(fn, ms);
  };
}

bindSwitches((flipped) => {
  renderPreview();
  if (flipped) showSaved();
});

// Invalid lines are skipped by compileTestPatterns; say which ones, so a typo
// doesn't silently stop a pattern from matching.
function checkPatterns() {
  const bad = [];
  patternsEl.value.split('\n').forEach((line, i) => {
    const l = line.trim();
    if (!l || l.startsWith('#')) return;
    try {
      new RegExp(l, 'i');
    } catch {
      bad.push(i + 1);
    }
  });
  patternsEl.setAttribute('aria-invalid', String(bad.length > 0));
  patternErrorEl.textContent = !bad.length
    ? ''
    : bad.length === 1
      ? `Line ${bad[0]} is not a valid regular expression, so it is ignored.`
      : `Lines ${bad.join(', ')} are not valid regular expressions, so they are ignored.`;
}

const savePatterns = debounce(async () => {
  await chrome.storage.sync.set({ patterns: patternsEl.value });
  showSaved();
}, 600);

const saveToken = debounce(async () => {
  await chrome.storage.local.set({ token: tokenEl.value.trim() });
  showSaved();
}, 600);

chrome.storage.sync.get('patterns', (s) => {
  patternsEl.value = s.patterns || DEFAULT_TEST_PATTERNS;
  checkPatterns();
});
chrome.storage.local.get('token', (s) => {
  tokenEl.value = s.token || '';
});

patternsEl.addEventListener('input', () => {
  checkPatterns();
  savePatterns();
});
tokenEl.addEventListener('input', saveToken);

document.getElementById('reset').addEventListener('click', () => {
  patternsEl.value = DEFAULT_TEST_PATTERNS;
  checkPatterns();
  savePatterns();
});

document.getElementById('show-token').addEventListener('click', (e) => {
  const hidden = tokenEl.type === 'password';
  tokenEl.type = hidden ? 'text' : 'password';
  e.currentTarget.textContent = hidden ? 'Hide' : 'Show';
});
