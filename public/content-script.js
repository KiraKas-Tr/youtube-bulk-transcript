(() => {
  const BUTTON_ID = 'bulk-transcript-saver-navbar-button';
  const STORAGE_KEY = 'capturedYoutubeUrls';
  const PENDING_CHANNEL_COLLECT_KEY = 'bulkTranscriptSaverPendingChannelCollect';
  const MAX_CAPTURED_URLS = 50;

  function sleep(ms) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }

  function getYoutubeHost(url = window.location.href) {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
  }

  function toCanonicalVideoUrl(input) {
    try {
      const url = new URL(input, window.location.origin);
      const host = getYoutubeHost(url.href);
      if (host !== 'youtube.com' && host !== 'm.youtube.com' && host !== 'youtu.be') return null;

      let videoId = null;
      if (host === 'youtu.be') {
        videoId = url.pathname.split('/').filter(Boolean)[0] || null;
      } else if (url.pathname === '/watch') {
        videoId = url.searchParams.get('v');
      } else {
        const shortsMatch = url.pathname.match(/^\/shorts\/([^/?#]+)/);
        if (shortsMatch) videoId = shortsMatch[1];
      }

      if (!videoId || !/^[a-zA-Z0-9_-]{6,20}$/.test(videoId)) return null;
      return `https://www.youtube.com/watch?v=${videoId}`;
    } catch {
      return null;
    }
  }

  function getCurrentVideoUrl() {
    return toCanonicalVideoUrl(window.location.href);
  }

  function isChannelPage() {
    const url = new URL(window.location.href);
    const host = getYoutubeHost();
    if (host !== 'youtube.com' && host !== 'm.youtube.com') return false;
    if (getCurrentVideoUrl()) return false;
    return /^\/(?:@[^/]+|channel\/[^/]+|c\/[^/]+|user\/[^/]+)/.test(url.pathname);
  }

  function isChannelVideoListingPage() {
    return isChannelPage() && /\/(?:videos|shorts|streams)(?:\/)?$/.test(new URL(window.location.href).pathname);
  }

  function getChannelVideosUrl() {
    const url = new URL(window.location.href);
    const parts = url.pathname.split('/').filter(Boolean);
    if (!parts.length) return null;

    let baseParts;
    if (parts[0].startsWith('@')) {
      baseParts = [parts[0]];
    } else if ((parts[0] === 'channel' || parts[0] === 'c' || parts[0] === 'user') && parts[1]) {
      baseParts = [parts[0], parts[1]];
    } else {
      return null;
    }

    return `${url.origin}/${baseParts.join('/')}/videos`;
  }

  function extractVideoUrlsFromPage() {
    const urls = new Set();
    document.querySelectorAll('a[href*="/watch?v="], a[href^="/shorts/"]').forEach((anchor) => {
      const canonical = toCanonicalVideoUrl(anchor.getAttribute('href') || anchor.href);
      if (canonical) urls.add(canonical);
    });
    return [...urls];
  }

  function setButtonState(button, state, count) {
    if (state === 'added') {
      button.textContent = count ? `Added ${count} ✓` : 'Added ✓';
      button.dataset.state = 'added';
      window.setTimeout(() => setButtonState(button, getPageMode()), 1600);
      return;
    }
    if (state === 'collecting') {
      button.textContent = count ? `Collecting ${count}/${MAX_CAPTURED_URLS}` : 'Collecting...';
      button.dataset.state = 'collecting';
      button.disabled = true;
      button.style.display = 'inline-flex';
      return;
    }
    if (state === 'channel') {
      button.textContent = 'Collect channel';
      button.dataset.state = 'channel';
      button.disabled = false;
      button.style.display = 'inline-flex';
      button.style.alignItems = 'center';
      button.title = `Collect channel video URLs into Bulk Transcript Saver, up to ${MAX_CAPTURED_URLS}.`;
      return;
    }
    if (state === 'video') {
      button.textContent = 'Add to saver';
      button.dataset.state = 'video';
      button.disabled = false;
      button.style.display = 'inline-flex';
      button.style.alignItems = 'center';
      button.title = 'Add this video URL and open Bulk Transcript Saver side panel';
      return;
    }

    button.textContent = '';
    button.dataset.state = 'unavailable';
    button.disabled = true;
    button.style.display = 'none';
  }

  function getPageMode() {
    if (getCurrentVideoUrl()) return 'video';
    if (isChannelPage()) return 'channel';
    return 'unavailable';
  }

  async function appendCapturedUrls(urls) {
    const stored = await chrome.storage.local.get({ [STORAGE_KEY]: [] });
    const existing = Array.isArray(stored[STORAGE_KEY]) ? stored[STORAGE_KEY].filter((url) => typeof url === 'string') : [];
    const seen = new Set(existing);
    const next = [...existing];

    for (const url of urls) {
      if (url && !seen.has(url) && next.length < MAX_CAPTURED_URLS) {
        seen.add(url);
        next.push(url);
      }
    }

    await chrome.storage.local.set({ [STORAGE_KEY]: next });
    return next.length - existing.length;
  }

  async function captureCurrentUrl(button) {
    const currentUrl = getCurrentVideoUrl();
    if (!currentUrl) {
      setButtonState(button, getPageMode());
      return;
    }

    const addedCount = await appendCapturedUrls([currentUrl]);
    setButtonState(button, 'added', addedCount || 1);
    chrome.runtime.sendMessage({ type: 'OPEN_TRANSCRIPT_SAVER_SIDE_PANEL' });
  }

  async function collectChannelUrls(button) {
    if (!isChannelVideoListingPage()) {
      const videosUrl = getChannelVideosUrl();
      if (videosUrl) {
        sessionStorage.setItem(PENDING_CHANNEL_COLLECT_KEY, '1');
        window.location.href = videosUrl;
        return;
      }
    }

    setButtonState(button, 'collecting', 0);
    const found = new Set();
    let stableRounds = 0;
    let lastCount = 0;

    for (let round = 0; round < 35 && found.size < MAX_CAPTURED_URLS; round += 1) {
      extractVideoUrlsFromPage().forEach((url) => {
        if (found.size < MAX_CAPTURED_URLS) found.add(url);
      });

      setButtonState(button, 'collecting', found.size);
      if (found.size === lastCount) {
        stableRounds += 1;
      } else {
        stableRounds = 0;
        lastCount = found.size;
      }
      if (stableRounds >= 5) break;

      window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' });
      await sleep(750);
    }

    const urls = [...found];
    const addedCount = await appendCapturedUrls(urls);
    setButtonState(button, 'added', addedCount || urls.length);
    chrome.runtime.sendMessage({ type: 'OPEN_TRANSCRIPT_SAVER_SIDE_PANEL' });
  }

  function createButton() {
    const button = document.createElement('button');
    button.id = BUTTON_ID;
    button.type = 'button';
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
      if (getCurrentVideoUrl()) {
        void captureCurrentUrl(button);
      } else if (isChannelPage()) {
        void collectChannelUrls(button);
      }
    });
    setButtonState(button, getPageMode());
    return button;
  }

  function ensureButton() {
    const end = document.querySelector('ytd-masthead #end') || document.querySelector('#masthead #end');
    if (!end) return;

    const existing = document.getElementById(BUTTON_ID);
    if (existing) {
      if (existing.dataset.state !== 'collecting') setButtonState(existing, getPageMode());
      return;
    }

    end.prepend(createButton());
  }

  async function maybeContinuePendingChannelCollect() {
    if (sessionStorage.getItem(PENDING_CHANNEL_COLLECT_KEY) !== '1' || !isChannelVideoListingPage()) return;
    sessionStorage.removeItem(PENDING_CHANNEL_COLLECT_KEY);
    await sleep(1000);
    const button = document.getElementById(BUTTON_ID) || createButton();
    if (!button.isConnected) {
      const end = document.querySelector('ytd-masthead #end') || document.querySelector('#masthead #end');
      end?.prepend(button);
    }
    await collectChannelUrls(button);
  }

  ensureButton();
  void maybeContinuePendingChannelCollect();
  window.setInterval(ensureButton, 1000);
  window.addEventListener('yt-navigate-finish', () => {
    ensureButton();
    void maybeContinuePendingChannelCollect();
  });
})();
