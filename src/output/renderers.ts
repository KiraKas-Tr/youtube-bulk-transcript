import type { BulkJob, Transcript } from '../types';
import { formatTranscriptTimestamp, getCounts } from '../utils/format';
import { renderCsv } from '../utils/csv';

function transcriptLines(transcript: Transcript): string[] {
  return transcript.segments.map((segment) => `[${formatTranscriptTimestamp(segment.start)}] ${segment.text}`);
}

export function renderTxt(transcript: Transcript): string {
  return [...transcriptLines(transcript), ''].join('\n');
}

export function renderIndexCsv(job: BulkJob): string {
  return renderCsv(
    ['job_id', 'order', 'video_id', 'title', 'channel', 'url', 'language', 'status', 'txt_file', 'error'],
    job.items.map((item) => [
      job.id,
      item.order,
      item.videoId,
      item.title,
      item.channel,
      item.canonicalUrl ?? item.inputUrl,
      item.language,
      item.status,
      item.files?.txt,
      item.error,
    ]),
  );
}

export function renderFailedCsv(job: BulkJob): string {
  const failed = job.items.filter((item) => item.status === 'failed');
  return renderCsv(
    ['job_id', 'order', 'video_id', 'url', 'title', 'channel', 'language', 'error'],
    failed.map((item) => [job.id, item.order, item.videoId, item.canonicalUrl ?? item.inputUrl, item.title, item.channel, item.language, item.error]),
  );
}

export function renderMetadataJson(job: BulkJob): string {
  return JSON.stringify(
    {
      job_id: job.id,
      type: job.type,
      created_at: job.createdAt,
      completed_at: job.completedAt,
      selected_language: job.selectedLanguage,
      formats: job.formats,
      folder_name: job.folderName,
      counts: getCounts(job.items),
      processing_settings: {
        max_videos: job.settings.maxVideos,
        concurrency: job.settings.concurrency,
        retry_count: job.settings.retryCount,
        timeout_ms: job.settings.timeoutMs,
      },
    },
    null,
    2,
  ) + '\n';
}
