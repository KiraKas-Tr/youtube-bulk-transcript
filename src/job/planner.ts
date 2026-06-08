import type { BulkJob, JobItem, ProcessingSettings } from '../types';
import { USER_ERRORS } from '../types';
import { formatJobId } from '../utils/format';
import { parseYouTubeUrl } from '../utils/url';

export const DEFAULT_SETTINGS: ProcessingSettings = {
  maxVideos: 50,
  concurrency: 2,
  retryCount: 1,
  timeoutMs: 25_000,
};

export function planJob(inputs: string[], selectedLanguage: string, settings: ProcessingSettings = DEFAULT_SETTINGS): BulkJob {
  const seen = new Set<string>();
  let processableCount = 0;
  const items: JobItem[] = [];

  for (const raw of inputs) {
    const inputUrl = raw.trim();
    if (!inputUrl) continue;

    const order = items.length + 1;
    const parsed = parseYouTubeUrl(inputUrl);

    if (!parsed.ok) {
      items.push({ order, inputUrl, status: 'skipped', error: USER_ERRORS.INVALID_URL });
      continue;
    }

    if (seen.has(parsed.videoId)) {
      items.push({
        order,
        inputUrl,
        videoId: parsed.videoId,
        canonicalUrl: parsed.canonicalUrl,
        status: 'skipped',
        error: USER_ERRORS.DUPLICATE,
      });
      continue;
    }

    seen.add(parsed.videoId);

    if (processableCount >= settings.maxVideos) {
      items.push({
        order,
        inputUrl,
        videoId: parsed.videoId,
        canonicalUrl: parsed.canonicalUrl,
        status: 'skipped',
        error: USER_ERRORS.MAX_VIDEOS,
      });
      continue;
    }

    processableCount += 1;
    items.push({
      order,
      inputUrl,
      videoId: parsed.videoId,
      canonicalUrl: parsed.canonicalUrl,
      status: 'pending',
    });
  }

  return {
    id: formatJobId(),
    type: 'mixed',
    selectedLanguage: selectedLanguage || 'auto',
    formats: ['md', 'txt', 'json'],
    createdAt: new Date().toISOString(),
    settings,
    items,
  };
}
