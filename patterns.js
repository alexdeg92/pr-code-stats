// Shared by the content script and the options page.
// One regex per line, matched against the file path. Lines starting with # are ignored.
const DEFAULT_TEST_PATTERNS = [
  '(^|/)(__tests__|__mocks__|__snapshots__|tests?|specs?|e2e|cypress|playwright)/',
  '\\.(test|spec|e2e|cy)\\.[cm]?[jt]sx?$',
  '_test\\.(go|py|rb|exs?)$',
  '(^|/)test_[^/]*\\.py$',
  '(^|/)conftest\\.py$',
  'Tests?\\.(swift|kt|java|cs|php)$',
  '\\.snap$',
].join('\n');

function compileTestPatterns(text) {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'))
    .flatMap((l) => {
      try {
        return [new RegExp(l, 'i')];
      } catch {
        return [];
      }
    });
}
