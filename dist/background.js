function openApp() {
  chrome.tabs.create({ url: chrome.runtime.getURL('index.html') });
}

chrome.action.onClicked.addListener(openApp);

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === 'OPEN_TRANSCRIPT_SAVER') {
    openApp();
  }
});
