function openAppTab() {
  chrome.tabs.create({ url: chrome.runtime.getURL('index.html') });
}

async function openAppSidePanel(tabId) {
  if (!chrome.sidePanel?.open || typeof tabId !== 'number') {
    openAppTab();
    return;
  }

  try {
    await chrome.sidePanel.open({ tabId });
  } catch {
    openAppTab();
  }
}

chrome.action.onClicked.addListener((tab) => {
  void openAppSidePanel(tab.id);
});

chrome.runtime.onMessage.addListener((message, sender) => {
  if (message?.type === 'OPEN_TRANSCRIPT_SAVER_SIDE_PANEL') {
    void openAppSidePanel(sender.tab?.id);
  }
});
