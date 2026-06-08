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

type InnertubeConfig = {
  apiKey: string;
  context: Record<string, unknown>;
  clientVersion: string;
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

function removeQuery(url: string, key: string): string {
  const parsed = new URL(url);
  parsed.searchParams.delete(key);
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
  const nodes = Array.from(doc.querySelectorAll('text, p'));
  return nodes
    .map((node) => {
      const segmentText = normalizeWhitespace(node.textContent ?? '');
      const start = Number(node.getAttribute('start') ?? node.getAttribute('t'));
      const durAttr = node.getAttribute('dur') ?? node.getAttribute('d');
      const rawDuration = durAttr == null ? undefined : Number(durAttr);
      const usesMilliseconds = node.hasAttribute('t') || node.hasAttribute('d');
      if (!Number.isFinite(start) || !segmentText) return null;
      return {
        start: usesMilliseconds ? start / 1000 : start,
        ...(rawDuration != null && Number.isFinite(rawDuration) ? { duration: usesMilliseconds ? rawDuration / 1000 : rawDuration } : {}),
        text: segmentText,
      };
    })
    .filter((segment): segment is TranscriptSegment => Boolean(segment));
}

function parseTimedTextTrackList(xml: string, videoId: string): CaptionTrack[] {
  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  return Array.from(doc.querySelectorAll('track')).map((track) => {
    const lang = track.getAttribute('lang_code') || track.getAttribute('lang_original') || '';
    const name = track.getAttribute('name') || '';
    const kind = track.getAttribute('kind') || undefined;
    const url = new URL('https://www.youtube.com/api/timedtext');
    url.searchParams.set('v', videoId);
    url.searchParams.set('lang', lang);
    if (name) url.searchParams.set('name', name);
    if (kind) url.searchParams.set('kind', kind);
    return {
      baseUrl: url.toString(),
      languageCode: lang,
      kind,
      name: { simpleText: track.getAttribute('lang_translated') || track.getAttribute('lang_original') || lang },
    };
  }).filter((track) => Boolean(track.languageCode));
}

async function fetchText(url: string, signal: AbortSignal): Promise<string> {
  const response = await fetch(url, {
    signal,
    credentials: 'include',
    headers: {
      'accept-language': 'en-US,en;q=0.9',
    },
  });
  if (!response.ok) throw new TranscriptError('FETCH_FAILED');
  return response.text();
}

function extractInnertubeConfig(html: string): InnertubeConfig | null {
  const apiKey = html.match(/"INNERTUBE_API_KEY"\s*:\s*"([^"]+)"/)?.[1];
  const clientVersion = html.match(/"INNERTUBE_CLIENT_VERSION"\s*:\s*"([^"]+)"/)?.[1] ?? '2.20240601.00.00';
  const context = extractJsonObject(html, '"INNERTUBE_CONTEXT"') as Record<string, unknown> | null;

  if (!apiKey) return null;
  return {
    apiKey,
    clientVersion,
    context: context ?? { client: { clientName: 'WEB', clientVersion } },
  };
}

function hasCaptionTracks(player: PlayerResponse | null): boolean {
  return Boolean(player?.captions?.playerCaptionsTracklistRenderer?.captionTracks?.length);
}

function extractInitialData(html: string): unknown | null {
  return extractJsonObject(html, 'ytInitialData')
    ?? extractJsonObject(html, 'var ytInitialData =')
    ?? extractJsonObject(html, 'window["ytInitialData"] =');
}

function walk(value: unknown, visitor: (node: Record<string, unknown>) => void): void {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    value.forEach((item) => walk(item, visitor));
    return;
  }
  const node = value as Record<string, unknown>;
  visitor(node);
  Object.values(node).forEach((item) => walk(item, visitor));
}

function extractTranscriptParams(initialData: unknown): string[] {
  const params = new Set<string>();
  walk(initialData, (node) => {
    const endpoint = node.getTranscriptEndpoint as { params?: unknown } | undefined;
    if (typeof endpoint?.params === 'string') params.add(endpoint.params);
  });
  return [...params];
}

function textFromRuns(value: unknown): string {
  if (!value || typeof value !== 'object') return '';
  const runs = (value as { runs?: Array<{ text?: string }> }).runs;
  if (!Array.isArray(runs)) return '';
  return normalizeWhitespace(runs.map((run) => run.text ?? '').join(''));
}

function parseTranscriptPanelResponse(data: unknown): TranscriptSegment[] {
  const segments: TranscriptSegment[] = [];
  walk(data, (node) => {
    const renderer = node.transcriptSegmentRenderer as {
      startMs?: string;
      endMs?: string;
      snippet?: unknown;
    } | undefined;
    if (!renderer?.snippet || renderer.startMs == null) return;

    const startMs = Number(renderer.startMs);
    const endMs = renderer.endMs == null ? undefined : Number(renderer.endMs);
    const text = textFromRuns(renderer.snippet);
    if (!Number.isFinite(startMs) || !text) return;

    segments.push({
      start: startMs / 1000,
      ...(endMs != null && Number.isFinite(endMs) && endMs > startMs ? { duration: (endMs - startMs) / 1000 } : {}),
      text,
    });
  });
  return segments;
}

async function fetchInnertubePlayer(videoId: string, config: InnertubeConfig, signal: AbortSignal): Promise<PlayerResponse | null> {
  const contexts: Array<Record<string, unknown>> = [
    config.context,
    { client: { clientName: 'WEB', clientVersion: config.clientVersion, hl: 'en', gl: 'US' } },
    { client: { clientName: 'WEB_EMBEDDED_PLAYER', clientVersion: config.clientVersion, hl: 'en', gl: 'US' } },
    { client: { clientName: 'TVHTML5_SIMPLY_EMBEDDED_PLAYER', clientVersion: '2.0', hl: 'en', gl: 'US' } },
  ];

  for (const context of contexts) {
    const response = await fetch(`https://www.youtube.com/youtubei/v1/player?key=${encodeURIComponent(config.apiKey)}`, {
      method: 'POST',
      signal,
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        context,
        videoId,
        contentCheckOk: true,
        racyCheckOk: true,
      }),
    });

    if (!response.ok) continue;
    const player = (await response.json()) as PlayerResponse;
    if (hasCaptionTracks(player)) return player;
  }

  return null;
}

async function resolvePlayer(videoId: string, url: string, signal: AbortSignal): Promise<PlayerResponse> {
  const watchHtml = await fetchText(`${url}&hl=en&persist_hl=1&bpctr=9999999999&has_verified=1`, signal);
  const htmlPlayer = extractJsonObject(watchHtml, 'ytInitialPlayerResponse') as PlayerResponse | null;
  if (hasCaptionTracks(htmlPlayer)) return htmlPlayer!;

  const config = extractInnertubeConfig(watchHtml);
  if (config) {
    const apiPlayer = await fetchInnertubePlayer(videoId, config, signal);
    if (hasCaptionTracks(apiPlayer)) return apiPlayer!;
    if (htmlPlayer) return htmlPlayer;
  }

  if (htmlPlayer) return htmlPlayer;
  throw new TranscriptError('UNAVAILABLE');
}

async function resolveTimedTextTracks(videoId: string, signal: AbortSignal): Promise<CaptionTrack[]> {
  const listUrl = `https://www.youtube.com/api/timedtext?type=list&v=${encodeURIComponent(videoId)}&hl=en`;
  try {
    const xml = await fetchText(listUrl, signal);
    return parseTimedTextTrackList(xml, videoId);
  } catch {
    return [];
  }
}

async function fetchCaptionSegments(track: CaptionTrack, signal: AbortSignal): Promise<TranscriptSegment[]> {
  const candidates = [
    appendQuery(track.baseUrl, 'fmt', 'json3'),
    appendQuery(track.baseUrl, 'fmt', 'srv3'),
    removeQuery(track.baseUrl, 'fmt'),
  ];
  const seen = new Set<string>();

  for (const url of candidates) {
    if (seen.has(url)) continue;
    seen.add(url);
    try {
      const captionText = await fetchText(url, signal);
      const segments = parseJson3(captionText) ?? parseCaptionXml(captionText);
      if (segments.length) return segments;
    } catch {
      // Try the next caption format.
    }
  }

  return [];
}

async function fetchTranscriptPanelSegments(videoId: string, url: string, signal: AbortSignal): Promise<TranscriptSegment[]> {
  const html = await fetchText(`${url}&hl=en&persist_hl=1`, signal);
  const config = extractInnertubeConfig(html);
  const initialData = extractInitialData(html);
  const params = extractTranscriptParams(initialData);
  if (!config || !params.length) return [];

  const headers = {
    'content-type': 'application/json',
    'x-youtube-client-name': '1',
    'x-youtube-client-version': config.clientVersion,
  };

  for (const param of params) {
    try {
      const response = await fetch(`https://www.youtube.com/youtubei/v1/get_transcript?key=${encodeURIComponent(config.apiKey)}&prettyPrint=false`, {
        method: 'POST',
        signal,
        credentials: 'include',
        headers,
        body: JSON.stringify({
          context: config.context,
          externalVideoId: videoId,
          params: param,
        }),
      });
      if (!response.ok) continue;
      const data = await response.json();
      const segments = parseTranscriptPanelResponse(data);
      if (segments.length) return segments;
    } catch {
      // Try the next transcript endpoint params value.
    }
  }

  return [];
}

export type GetTranscriptOptions = {
  language?: string;
  signal?: AbortSignal;
};

export async function resolveTranscript(item: JobItem, language: string, signal: AbortSignal): Promise<Transcript> {
  if (!item.videoId) throw new TranscriptError('INVALID_URL');

  try {
    const url = item.canonicalUrl ?? `https://www.youtube.com/watch?v=${item.videoId}`;
    const player = await resolvePlayer(item.videoId, url, signal);

    const status = player.playabilityStatus?.status;
    if (status && status !== 'OK') throw new TranscriptError('UNAVAILABLE');

    const playerTracks = player.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [];
    const timedTextTracks = playerTracks.length ? [] : await resolveTimedTextTracks(item.videoId, signal);
    const tracks = playerTracks.length ? playerTracks : timedTextTracks;
    if (!tracks.length) throw new TranscriptError('NO_TRANSCRIPT');

    const selectedTrack = selectCaptionTrack(tracks, language);
    let segments = await fetchCaptionSegments(selectedTrack, signal);
    if (!segments.length) {
      segments = await fetchTranscriptPanelSegments(item.videoId, url, signal);
    }
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
