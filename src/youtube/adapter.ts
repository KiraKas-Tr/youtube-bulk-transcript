import type { JobItem, Transcript, TranscriptSegment } from '../types';
import { USER_ERRORS } from '../types';
import { parseYouTubeUrl } from '../utils/url';

type CaptionTrack = {
  baseUrl: string;
  languageCode: string;
  kind?: string;
  name?: { simpleText?: string; runs?: Array<{ text: string }> };
};

type PlayerResponse = {
  playabilityStatus?: { status?: string; reason?: string };
  videoDetails?: { title?: string; author?: string; videoId?: string };
  captions?: {
    playerCaptionsTracklistRenderer?: {
      captionTracks?: CaptionTrack[];
    };
  };
};

export class TranscriptError extends Error {
  constructor(public code: keyof typeof USER_ERRORS) {
    super(USER_ERRORS[code]);
    this.name = 'TranscriptError';
  }
}

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

function extractJsonObject(source: string, marker: string): unknown | null {
  const markerIndex = source.indexOf(marker);
  if (markerIndex < 0) return null;
  const start = source.indexOf('{', markerIndex);
  if (start < 0) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < source.length; i += 1) {
    const char = source[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
    } else if (char === '{') {
      depth += 1;
    } else if (char === '}') {
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

function trackName(track: CaptionTrack): string {
  if (track.name?.simpleText) return track.name.simpleText;
  return track.name?.runs?.map((run) => run.text).join('') ?? track.languageCode;
}

function selectCaptionTrack(tracks: CaptionTrack[], selectedLanguage: string): CaptionTrack {
  if (!tracks.length) throw new TranscriptError('NO_TRANSCRIPT');

  const normalized = selectedLanguage.trim().toLowerCase();
  if (!normalized || normalized === 'auto') {
    return tracks.find((track) => track.kind !== 'asr') ?? tracks[0];
  }

  const exact = tracks.find((track) => track.languageCode.toLowerCase() === normalized);
  if (exact) return exact;

  const languagePrefix = tracks.find((track) => track.languageCode.toLowerCase().startsWith(`${normalized}-`));
  if (languagePrefix) return languagePrefix;

  const nameMatch = tracks.find((track) => trackName(track).toLowerCase().includes(normalized));
  if (nameMatch) return nameMatch;

  throw new TranscriptError('LANGUAGE_UNAVAILABLE');
}

function appendQuery(url: string, key: string, value: string): string {
  const parsed = new URL(url);
  parsed.searchParams.set(key, value);
  return parsed.toString();
}

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function parseJson3(text: string): TranscriptSegment[] | null {
  try {
    const data = JSON.parse(text) as {
      events?: Array<{ tStartMs?: number; dDurationMs?: number; segs?: Array<{ utf8?: string }> }>;
    };
    if (!Array.isArray(data.events)) return null;
    return data.events
      .map((event) => {
        const segmentText = normalizeWhitespace(event.segs?.map((segment) => segment.utf8 ?? '').join('') ?? '');
        if (!segmentText || event.tStartMs == null) return null;
        return {
          start: event.tStartMs / 1000,
          ...(event.dDurationMs != null ? { duration: event.dDurationMs / 1000 } : {}),
          text: segmentText,
        };
      })
      .filter((segment): segment is TranscriptSegment => Boolean(segment));
  } catch {
    return null;
  }
}

function parseCaptionXml(text: string): TranscriptSegment[] {
  const doc = new DOMParser().parseFromString(text, 'text/xml');
  const nodes = Array.from(doc.querySelectorAll('text'));
  return nodes
    .map((node) => {
      const segmentText = normalizeWhitespace(node.textContent ?? '');
      const start = Number(node.getAttribute('start'));
      const dur = node.getAttribute('dur');
      if (!Number.isFinite(start) || !segmentText) return null;
      return {
        start,
        ...(dur != null && Number.isFinite(Number(dur)) ? { duration: Number(dur) } : {}),
        text: segmentText,
      };
    })
    .filter((segment): segment is TranscriptSegment => Boolean(segment));
}

async function fetchText(url: string, signal: AbortSignal): Promise<string> {
  const response = await fetch(url, { signal, credentials: 'omit' });
  if (!response.ok) throw new TranscriptError('FETCH_FAILED');
  return response.text();
}

export type GetTranscriptOptions = {
  language?: string;
  signal?: AbortSignal;
};

export async function resolveTranscript(item: JobItem, language: string, signal: AbortSignal): Promise<Transcript> {
  if (!item.videoId) throw new TranscriptError('INVALID_URL');

  try {
    const url = item.canonicalUrl ?? `https://www.youtube.com/watch?v=${item.videoId}`;
    const watchHtml = await fetchText(`${url}&hl=en`, signal);
    const player = extractJsonObject(watchHtml, 'ytInitialPlayerResponse') as PlayerResponse | null;
    if (!player) throw new TranscriptError('UNAVAILABLE');

    const status = player.playabilityStatus?.status;
    if (status && status !== 'OK') throw new TranscriptError('UNAVAILABLE');

    const tracks = player.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [];
    if (!tracks.length) throw new TranscriptError('NO_TRANSCRIPT');

    const selectedTrack = selectCaptionTrack(tracks, language);
    const captionText = await fetchText(appendQuery(selectedTrack.baseUrl, 'fmt', 'json3'), signal);
    const segments = parseJson3(captionText) ?? parseCaptionXml(captionText);
    if (!segments.length) throw new TranscriptError('NO_TRANSCRIPT');

    const title = player.videoDetails?.title?.trim() || item.title || `untitled-video-${item.videoId}`;
    const channel = player.videoDetails?.author?.trim() || item.channel;

    return {
      videoId: player.videoDetails?.videoId ?? item.videoId,
      url,
      title,
      channel,
      language: selectedTrack.languageCode,
      source: 'public_captions',
      segments,
    };
  } catch (error) {
    if (isAbort(error)) throw error;
    if (error instanceof TranscriptError) throw error;
    throw new TranscriptError('FETCH_FAILED');
  }
}

export async function getTranscript(videoUrl: string, options: GetTranscriptOptions = {}): Promise<Transcript> {
  const parsed = parseYouTubeUrl(videoUrl);
  if (!parsed.ok) throw new TranscriptError('INVALID_URL');

  const controller = options.signal ? undefined : new AbortController();
  const signal = options.signal ?? controller!.signal;

  return resolveTranscript(
    {
      order: 1,
      inputUrl: videoUrl,
      videoId: parsed.videoId,
      canonicalUrl: parsed.canonicalUrl,
      status: 'pending',
    },
    options.language ?? 'auto',
    signal,
  );
}

export function transcriptToText(transcript: Transcript): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  const formatTime = (seconds: number) => {
    const safe = Math.max(0, Math.floor(seconds));
    const h = Math.floor(safe / 3600);
    const m = Math.floor((safe % 3600) / 60);
    const s = safe % 60;
    return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
  };
  return transcript.segments.map((segment) => `[${formatTime(segment.start)}] ${segment.text}`).join('\n') + '\n';
}

export async function getTranscriptText(videoUrl: string, options: GetTranscriptOptions = {}): Promise<string> {
  return transcriptToText(await getTranscript(videoUrl, options));
}

export function toUserFacingTranscriptError(error: unknown): string {
  if (error instanceof TranscriptError) return error.message;
  if (isAbort(error)) return USER_ERRORS.CANCELLED;
  return USER_ERRORS.FETCH_FAILED;
}
