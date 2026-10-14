// Toolbar popup: the on/off settings, changed in place. Open GitHub tabs pick the
// change up from storage, like they do for the options page.
bindSwitches();

document.getElementById('all-settings').addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
  window.close();
});
