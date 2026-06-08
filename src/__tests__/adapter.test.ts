import { afterEach, describe, expect, it, vi } from 'vitest';
import { getTranscript, getTranscriptText, TranscriptError } from '../youtube/adapter';

function watchHtml() {
  const player = {
    playabilityStatus: { status: 'OK' },
    videoDetails: { title: 'Test Video', author: 'Test Channel', videoId: 'dQw4w9WgXcQ' },
    captions: {
      playerCaptionsTracklistRenderer: {
        captionTracks: [
          {
            baseUrl: 'https://www.youtube.com/api/timedtext?v=dQw4w9WgXcQ&lang=en',
            languageCode: 'en',
            name: { simpleText: 'English' },
          },
        ],
      },
    },
  };
  return `<html><script>var ytInitialPlayerResponse = ${JSON.stringify(player)};</script></html>`;
}

function watchHtmlWithoutCaptions() {
  const player = {
    playabilityStatus: { status: 'OK' },
    videoDetails: { title: 'Fallback Video', author: 'Fallback Channel', videoId: 'dQw4w9WgXcQ' },
  };
  return `<html><script>var ytInitialPlayerResponse = ${JSON.stringify(player)};</script></html>`;
}

describe('getTranscript', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('resolves a transcript directly from a video URL', async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      const textUrl = String(url);
      if (textUrl.includes('/watch?')) {
        return new Response(watchHtml(), { status: 200 });
      }
      if (textUrl.includes('/api/timedtext')) {
        return new Response(
          JSON.stringify({
            events: [
              { tStartMs: 0, dDurationMs: 1000, segs: [{ utf8: 'Hello' }] },
              { tStartMs: 65000, dDurationMs: 1000, segs: [{ utf8: 'World' }] },
            ],
          }),
          { status: 200 },
        );
      }
      return new Response('', { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const transcript = await getTranscript('https://youtu.be/dQw4w9WgXcQ', { language: 'en' });
    expect(transcript).toMatchObject({
      videoId: 'dQw4w9WgXcQ',
      title: 'Test Video',
      channel: 'Test Channel',
      language: 'en',
    });
    expect(transcript.segments).toEqual([
      { start: 0, duration: 1, text: 'Hello' },
      { start: 65, duration: 1, text: 'World' },
    ]);
  });

  it('returns transcript-only TXT from getTranscriptText', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string | URL | Request) => {
      const textUrl = String(url);
      if (textUrl.includes('/watch?')) return new Response(watchHtml(), { status: 200 });
      return new Response(JSON.stringify({ events: [{ tStartMs: 1000, segs: [{ utf8: 'Line one' }] }] }), { status: 200 });
    }));

    await expect(getTranscriptText('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).resolves.toBe('[00:01] Line one\n');
  });

  it('falls back to timedtext track list when player captions are missing', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string | URL | Request) => {
      const textUrl = String(url);
      if (textUrl.includes('/watch?')) return new Response(watchHtmlWithoutCaptions(), { status: 200 });
      if (textUrl.includes('type=list')) {
        return new Response('<transcript_list><track lang_code="en" lang_original="English" lang_translated="English" /></transcript_list>', { status: 200 });
      }
      if (textUrl.includes('/api/timedtext')) {
        return new Response('<transcript><text start="2" dur="3">Fallback text</text></transcript>', { status: 200 });
      }
      return new Response('', { status: 404 });
    }));

    const transcript = await getTranscript('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    expect(transcript.title).toBe('Fallback Video');
    expect(transcript.segments).toEqual([{ start: 2, duration: 3, text: 'Fallback text' }]);
  });

  it('rejects invalid URLs', async () => {
    await expect(getTranscript('https://example.com/video')).rejects.toMatchObject({ code: 'INVALID_URL' } satisfies Partial<TranscriptError>);
  });
});
