(() => {
  const BUTTON_ID = 'bulk-transcript-saver-navbar-button';
  const STORAGE_KEY = 'capturedYoutubeUrls';
  const MAX_CAPTURED_URLS = 10000;
  const CHANNEL_TABS = ['videos', 'shorts', 'streams'];

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

  function getChannelBasePath() {
    const parts = new URL(window.location.href).pathname.split('/').filter(Boolean);
    if (!parts.length) return null;
    if (parts[0].startsWith('@')) return `/${parts[0]}`;
    if ((parts[0] === 'channel' || parts[0] === 'c' || parts[0] === 'user') && parts[1]) return `/${parts[0]}/${parts[1]}`;
    return null;
  }

  function getChannelTabUrl(tab) {
    const basePath = getChannelBasePath();
    if (!basePath) return null;
    return `${window.location.origin}${basePath}/${tab}`;
  }

  function extractBalancedJson(source, startIndex) {
    const start = source.indexOf('{', startIndex);
    if (start < 0) return null;

    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let i = start; i < source.length; i += 1) {
      const char = source[i];
      if (inString) {
        if (escaped) escaped = false;
        else if (char === '\\') escaped = true;
        else if (char === '"') inString = false;
        continue;
      }

      if (char === '"') inString = true;
      else if (char === '{') depth += 1;
      else if (char === '}') {
        depth -= 1;
        if (depth === 0) {
          try {
            return JSON.parse(source.slice(start, i + 1));
          } catch {
            return null;
          }
        }
      }
    }

    return null;
  }

  function extractJsonAfterMarker(source, marker) {
    const index = source.indexOf(marker);
    if (index < 0) return null;
    return extractBalancedJson(source, index + marker.length);
  }

  function extractInitialData(html) {
    return extractJsonAfterMarker(html, 'var ytInitialData =')
      || extractJsonAfterMarker(html, 'window["ytInitialData"] =')
      || extractJsonAfterMarker(html, 'ytInitialData =');
  }

  function extractInnertubeConfig(html) {
    const apiKey = html.match(/"INNERTUBE_API_KEY"\s*:\s*"([^"]+)"/)?.[1];
    const clientVersion = html.match(/"INNERTUBE_CLIENT_VERSION"\s*:\s*"([^"]+)"/)?.[1] || '2.20240601.00.00';
    const context = extractJsonAfterMarker(html, '"INNERTUBE_CONTEXT":') || {
      client: {
        clientName: 'WEB',
        clientVersion,
      },
    };

    if (!apiKey) return null;
    return { apiKey, context };
  }

  function walk(value, visitor) {
    if (!value || typeof value !== 'object') return;
    visitor(value);
    if (Array.isArray(value)) {
      value.forEach((item) => walk(item, visitor));
      return;
    }
    Object.keys(value).forEach((key) => walk(value[key], visitor));
  }

  function extractVideoUrlsFromData(data) {
    const ids = new Set();
    walk(data, (node) => {
      const videoId = node.videoRenderer?.videoId
        || node.gridVideoRenderer?.videoId
        || node.reelItemRenderer?.videoId
        || node.shortsLockupViewModel?.onTap?.innertubeCommand?.reelWatchEndpoint?.videoId
        || node.watchEndpoint?.videoId;
      if (videoId && /^[a-zA-Z0-9_-]{6,20}$/.test(videoId)) ids.add(videoId);
    });
    return [...ids].map((id) => `https://www.youtube.com/watch?v=${id}`);
  }

  function extractContinuationTokens(data) {
    const tokens = new Set();
    walk(data, (node) => {
      const token = node.continuationItemRenderer?.continuationEndpoint?.continuationCommand?.token
        || node.continuationEndpoint?.continuationCommand?.token
        || node.nextContinuationData?.continuation
        || node.reloadContinuationData?.continuation;
      if (typeof token === 'string' && token.length > 20) tokens.add(token);
    });
    return [...tokens];
  }

  async function fetchContinuation(config, continuation) {
    const response = await fetch(`https://www.youtube.com/youtubei/v1/browse?key=${encodeURIComponent(config.apiKey)}`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ context: config.context, continuation }),
    });
    if (!response.ok) throw new Error(`Continuation request failed: ${response.status}`);
    return response.json();
  }

  async function collectUrlsFromChannelTab(tabUrl, onProgress, collected) {
    const response = await fetch(tabUrl, { credentials: 'include' });
    if (!response.ok) return;

    const html = await response.text();
    const config = extractInnertubeConfig(html);
    const initialData = extractInitialData(html);
    if (!config || !initialData) return;

    extractVideoUrlsFromData(initialData).forEach((url) => {
      if (collected.size < MAX_CAPTURED_URLS) collected.add(url);
    });
    onProgress(collected.size);

    const queue = extractContinuationTokens(initialData);
    const seenTokens = new Set(queue);

    while (queue.length && collected.size < MAX_CAPTURED_URLS) {
      const token = queue.shift();
      if (!token) continue;
      await sleep(120);
      const data = await fetchContinuation(config, token);

      extractVideoUrlsFromData(data).forEach((url) => {
        if (collected.size < MAX_CAPTURED_URLS) collected.add(url);
      });
      onProgress(collected.size);

      extractContinuationTokens(data).forEach((nextToken) => {
        if (!seenTokens.has(nextToken)) {
          seenTokens.add(nextToken);
          queue.push(nextToken);
        }
      });
    }
  }

  function setButtonState(button, state, count) {
    if (state === 'added') {
      button.textContent = count ? `Added ${count} ✓` : 'Added ✓';
      button.dataset.state = 'added';
      window.setTimeout(() => setButtonState(button, getPageMode()), 1800);
      return;
    }
    if (state === 'collecting') {
      button.textContent = count ? `Collecting ${count}` : 'Collecting...';
      button.dataset.state = 'collecting';
      button.disabled = true;
      button.style.display = 'inline-flex';
      button.style.alignItems = 'center';
      return;
    }
    if (state === 'channel') {
      button.textContent = 'Collect channel';
      button.dataset.state = 'channel';
      button.disabled = false;
      button.style.display = 'inline-flex';
      button.style.alignItems = 'center';
      button.title = 'Collect channel video URLs without scrolling using YouTube continuation requests.';
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

  function openSidePanel() {
    chrome.runtime.sendMessage({ type: 'OPEN_TRANSCRIPT_SAVER_SIDE_PANEL' });
  }

  async function captureCurrentUrl(button) {
    const currentUrl = getCurrentVideoUrl();
    if (!currentUrl) {
      setButtonState(button, getPageMode());
      return;
    }

    openSidePanel();
    const addedCount = await appendCapturedUrls([currentUrl]);
    setButtonState(button, 'added', addedCount || 1);
  }

  async function collectChannelUrls(button) {
    openSidePanel();
    setButtonState(button, 'collecting', 0);

    try {
      const collected = new Set();
      for (const tab of CHANNEL_TABS) {
        if (collected.size >= MAX_CAPTURED_URLS) break;
        const tabUrl = getChannelTabUrl(tab);
        if (!tabUrl) continue;
        await collectUrlsFromChannelTab(tabUrl, (count) => setButtonState(button, 'collecting', count), collected);
      }

      const urls = [...collected];
      const addedCount = await appendCapturedUrls(urls);
      setButtonState(button, 'added', addedCount || urls.length);
    } catch (error) {
      console.error('[Bulk Transcript Saver] Channel collection failed', error);
      button.textContent = 'Collect failed';
      button.dataset.state = 'error';
      button.disabled = false;
    }
  }

  function parseTranscriptSegments(data) {
    const segments = [];
    walk(data, (node) => {
      const renderer = node.transcriptSegmentRenderer;
      if (!renderer?.snippet?.runs || renderer.startMs == null) return;
      const text = renderer.snippet.runs.map((run) => run.text || '').join('').replace(/\s+/g, ' ').trim();
      const startMs = Number(renderer.startMs);
      const endMs = renderer.endMs == null ? undefined : Number(renderer.endMs);
      if (!text || !Number.isFinite(startMs)) return;
      segments.push({
        start: startMs / 1000,
        ...(endMs != null && Number.isFinite(endMs) && endMs > startMs ? { duration: (endMs - startMs) / 1000 } : {}),
        text,
      });
    });
    return segments;
  }

  async function getTranscriptFromCurrentPage(requestedUrl) {
    const currentUrl = getCurrentVideoUrl();
    const requestedCanonical = toCanonicalVideoUrl(requestedUrl);
    if (!currentUrl || !requestedCanonical || currentUrl !== requestedCanonical) return null;

    const html = document.documentElement.outerHTML;
    const initialData = extractInitialData(html);
    const config = extractInnertubeConfig(html);
    if (!initialData || !config) return null;

    const params = [];
    walk(initialData, (node) => {
      const param = node.getTranscriptEndpoint?.params;
      if (typeof param === 'string' && !params.includes(param)) params.push(param);
    });
    if (!params.length) return null;

    for (const param of params) {
      const response = await fetch(`/youtubei/v1/get_transcript?key=${encodeURIComponent(config.apiKey)}&prettyPrint=false`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'content-type': 'application/json',
          'x-youtube-client-name': '1',
          'x-youtube-client-version': config.context?.client?.clientVersion || '2.20260606.02.00',
        },
        body: JSON.stringify({
          context: config.context,
          externalVideoId: new URL(currentUrl).searchParams.get('v'),
          params: param,
        }),
      });
      if (!response.ok) continue;
      const data = await response.json();
      const segments = parseTranscriptSegments(data);
      if (segments.length) {
        const title = document.querySelector('h1 yt-formatted-string, h1.title')?.textContent?.trim() || `untitled-video-${new URL(currentUrl).searchParams.get('v')}`;
        const channel = document.querySelector('ytd-video-owner-renderer #channel-name a, ytd-watch-metadata ytd-channel-name a')?.textContent?.trim();
        return {
          videoId: new URL(currentUrl).searchParams.get('v'),
          url: currentUrl,
          title,
          channel,
          language: 'auto',
          source: 'public_captions',
          segments,
        };
      }
    }

    return null;
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

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== 'GET_PAGE_TRANSCRIPT') return;

    getTranscriptFromCurrentPage(message.url)
      .then((transcript) => sendResponse(transcript ? { ok: true, transcript } : { ok: false, error: 'No transcript on current page.' }))
      .catch((error) => sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) }));
    return true;
  });

  ensureButton();
  window.setInterval(ensureButton, 1000);
  window.addEventListener('yt-navigate-finish', ensureButton);
})();
