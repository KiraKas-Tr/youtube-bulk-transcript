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

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'OPEN_TRANSCRIPT_SAVER_SIDE_PANEL') {
    void openAppSidePanel(sender.tab?.id);
    return;
  }

  if (message?.type === 'GET_ACTIVE_TAB_TRANSCRIPT') {
    chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
      const tabId = tabs[0]?.id;
      if (typeof tabId !== 'number') {
        sendResponse({ ok: false, error: 'No active YouTube tab.' });
        return;
      }

      chrome.tabs.sendMessage(tabId, {
        type: 'GET_PAGE_TRANSCRIPT',
        url: message.url,
        language: message.language,
      }, (response) => {
        if (chrome.runtime.lastError) {
          sendResponse({ ok: false, error: chrome.runtime.lastError.message });
          return;
        }
        sendResponse(response);
      });
    });
    return true;
  }
});
