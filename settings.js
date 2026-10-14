// Binds every `input[data-setting]` checkbox to the same key in chrome.storage.sync,
// both ways, so the popup, the options page and open GitHub tabs stay in step.
// `data-invert` flips the meaning, so every switch can read "Leave out ..." while
// the stored key stays `includeTests`.
// `onChange` gets the checkbox the user flipped, or nothing when storage changed.
function bindSwitches(onChange = () => {}) {
  const boxes = [...document.querySelectorAll('input[data-setting]')];
  const show = (b, value) => (b.checked = b.hasAttribute('data-invert') ? !value : !!value);
  chrome.storage.sync.get(
    boxes.map((b) => b.dataset.setting),
    (s) => {
      for (const b of boxes) show(b, s[b.dataset.setting]);
      onChange();
    }
  );
  for (const b of boxes) {
    b.addEventListener('change', () => {
      chrome.storage.sync.set({ [b.dataset.setting]: settingValue(b) });
      onChange(b);
    });
  }
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync') return;
    for (const b of boxes) {
      if (changes[b.dataset.setting]) show(b, changes[b.dataset.setting].newValue);
    }
    onChange();
  });
}

function settingValue(box) {
  return box.hasAttribute('data-invert') ? !box.checked : box.checked;
}
