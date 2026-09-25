const patternsEl = document.getElementById('patterns');
const tokenEl = document.getElementById('token');
const savedEl = document.getElementById('saved');

chrome.storage.sync.get('patterns', (s) => {
  patternsEl.value = s.patterns || DEFAULT_TEST_PATTERNS;
});
chrome.storage.local.get('token', (s) => {
  tokenEl.value = s.token || '';
});

document.getElementById('save').addEventListener('click', async () => {
  await chrome.storage.sync.set({ patterns: patternsEl.value });
  await chrome.storage.local.set({ token: tokenEl.value.trim() });
  savedEl.textContent = 'Saved';
  setTimeout(() => (savedEl.textContent = ''), 1500);
});

document.getElementById('reset').addEventListener('click', () => {
  patternsEl.value = DEFAULT_TEST_PATTERNS;
});
