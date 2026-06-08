const VIDEO_ID_RE = /^[a-zA-Z0-9_-]{6,20}$/;

export type ParseYouTubeUrlResult =
  | { ok: true; videoId: string; canonicalUrl: string }
  | { ok: false; error: 'INVALID_URL' };

export function parseYouTubeUrl(input: string): ParseYouTubeUrlResult {
  const trimmed = input.trim();
  if (!trimmed) return { ok: false, error: 'INVALID_URL' };

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return { ok: false, error: 'INVALID_URL' };
  }

  const host = url.hostname.replace(/^www\./, '').toLowerCase();
  let videoId: string | null = null;

  if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com') {
    if (url.pathname === '/watch') {
      videoId = url.searchParams.get('v');
    } else {
      const shortsMatch = url.pathname.match(/^\/shorts\/([^/?#]+)/);
      if (shortsMatch) videoId = shortsMatch[1];
    }
  } else if (host === 'youtu.be') {
    videoId = url.pathname.split('/').filter(Boolean)[0] ?? null;
  }

  if (!videoId || !VIDEO_ID_RE.test(videoId)) {
    return { ok: false, error: 'INVALID_URL' };
  }

  return {
    ok: true,
    videoId,
    canonicalUrl: `https://www.youtube.com/watch?v=${videoId}`,
  };
}
