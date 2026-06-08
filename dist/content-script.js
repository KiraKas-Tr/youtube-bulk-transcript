(() => {
  const BUTTON_ID = 'bulk-transcript-saver-navbar-button';
  const STORAGE_KEY = 'capturedYoutubeUrls';

  function getCurrentVideoUrl() {
    const url = new URL(window.location.href);
    const host = url.hostname.replace(/^www\./, '').toLowerCase();
    let videoId = null;

    if (host !== 'youtube.com' && host !== 'm.youtube.com') return null;

    if (url.pathname === '/watch') {
      videoId = url.searchParams.get('v');
    } else {
      const shortsMatch = url.pathname.match(/^\/shorts\/([^/?#]+)/);
      if (shortsMatch) videoId = shortsMatch[1];
    }

    if (!videoId || !/^[a-zA-Z0-9_-]{6,20}$/.test(videoId)) return null;
    return `https://www.youtube.com/watch?v=${videoId}`;
  }

  function setButtonState(button, state) {
    if (state === 'added') {
      button.textContent = 'Added ✓';
      button.dataset.state = 'added';
      window.setTimeout(() => setButtonState(button, getCurrentVideoUrl() ? 'ready' : 'unavailable'), 1400);
      return;
    }
    if (state === 'unavailable') {
      button.textContent = '';
      button.dataset.state = 'unavailable';
      button.disabled = true;
      button.style.display = 'none';
      return;
    }
    button.textContent = 'Add to saver';
    button.dataset.state = 'ready';
    button.disabled = false;
    button.style.display = 'inline-flex';
    button.style.alignItems = 'center';
  }

  async function captureCurrentUrl(button) {
    const currentUrl = getCurrentVideoUrl();
    if (!currentUrl) {
      setButtonState(button, 'unavailable');
      return;
    }

    const stored = await chrome.storage.local.get({ [STORAGE_KEY]: [] });
    const existing = Array.isArray(stored[STORAGE_KEY]) ? stored[STORAGE_KEY] : [];
    const next = existing.includes(currentUrl) ? existing : [...existing, currentUrl];
    await chrome.storage.local.set({ [STORAGE_KEY]: next });
    setButtonState(button, 'added');
    chrome.runtime.sendMessage({ type: 'OPEN_TRANSCRIPT_SAVER_SIDE_PANEL' });
  }

  function createButton() {
    const button = document.createElement('button');
    button.id = BUTTON_ID;
    button.type = 'button';
    button.title = 'Add this video URL and open Bulk Transcript Saver side panel';
    button.style.cssText = [
      'margin-right: 8px',
      'height: 32px',
      'padding: 0 12px',
      'border: 1px solid rgba(255,255,255,0.18)',
      'border-radius: 18px',
      'background: #2563eb',
      'color: #fff',
      'font: 500 13px Roboto, Arial, sans-serif',
      'cursor: pointer',
      'white-space: nowrap',
    ].join(';');
    button.addEventListener('click', () => {
      void captureCurrentUrl(button);
    });
    setButtonState(button, getCurrentVideoUrl() ? 'ready' : 'unavailable');
    return button;
  }

  function ensureButton() {
    const end = document.querySelector('ytd-masthead #end') || document.querySelector('#masthead #end');
    if (!end) return;

    const existing = document.getElementById(BUTTON_ID);
    if (existing) {
      setButtonState(existing, getCurrentVideoUrl() ? 'ready' : 'unavailable');
      return;
    }

    end.prepend(createButton());
  }

  ensureButton();
  window.setInterval(ensureButton, 1000);
  window.addEventListener('yt-navigate-finish', ensureButton);
})();
