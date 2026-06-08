import { describe, expect, it } from 'vitest';
import type { BulkJob, Transcript } from '../types';
import { csvEscape } from '../utils/csv';
import { formatJobTimestamp, formatTranscriptTimestamp, sanitizeFilenamePart } from '../utils/format';
import { renderFailedCsv, renderIndexCsv, renderJson, renderMarkdown, renderMetadataJson, renderTxt } from '../output/renderers';

const transcript: Transcript = {
  videoId: 'dQw4w9WgXcQ',
  url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  title: 'Video, "Title"',
  channel: 'Channel',
  language: 'en',
  source: 'public_captions',
  segments: [
    { start: 0, duration: 4.2, text: 'Intro text' },
    { start: 65, text: 'More text' },
  ],
};

const job: BulkJob = {
  id: 'job-1',
  type: 'mixed',
  selectedLanguage: 'auto',
  formats: ['md', 'txt', 'json'],
  createdAt: '2026-06-08T15:30:00.000Z',
  completedAt: '2026-06-08T15:31:00.000Z',
  folderName: 'bulk-transcripts-2026-06-08-1530',
  settings: { maxVideos: 50, concurrency: 2, retryCount: 1, timeoutMs: 25000 },
  items: [
    { order: 1, inputUrl: transcript.url, videoId: transcript.videoId, canonicalUrl: transcript.url, title: transcript.title, channel: 'Channel', language: 'en', status: 'success', files: { md: 'markdown/001.md', txt: 'txt/001.txt', json: 'json/001.json' } },
    { order: 2, inputUrl: 'bad', status: 'skipped', error: 'URL không hợp lệ.' },
    { order: 3, inputUrl: 'https://youtu.be/oHg5SJYRHA0', videoId: 'oHg5SJYRHA0', canonicalUrl: 'https://www.youtube.com/watch?v=oHg5SJYRHA0', status: 'failed', error: 'Video không có transcript public.' },
  ],
};

describe('format utilities and renderers', () => {
  it('formats timestamps and sanitizes filenames', () => {
    expect(formatJobTimestamp(new Date('2026-06-08T15:30:00'))).toBe('2026-06-08-1530');
    expect(formatTranscriptTimestamp(65)).toBe('01:05');
    expect(formatTranscriptTimestamp(3661)).toBe('01:01:01');
    expect(sanitizeFilenamePart('<bad>: name / file?', 'fallback')).toBe('bad- name - file');
  });

  it('escapes CSV fields', () => {
    expect(csvEscape('a,"b"\nc')).toBe('"a,""b""\nc"');
  });

  it('renders Markdown, TXT, and JSON transcript files', () => {
    expect(renderMarkdown(transcript, '2026-06-08 15:30')).toContain('Source: public captions');
    expect(renderMarkdown(transcript, '2026-06-08 15:30')).toContain('[01:05] More text');
    expect(renderTxt(transcript)).toContain('Language: en');
    expect(JSON.parse(renderJson(transcript))).toMatchObject({ video_id: 'dQw4w9WgXcQ', source: 'public_captions' });
  });

  it('renders reports with all index rows, failed-only failed.csv, and metadata counts', () => {
    const index = renderIndexCsv(job);
    const failed = renderFailedCsv(job);
    const metadata = JSON.parse(renderMetadataJson(job));
    expect(index.split('\n').filter(Boolean)).toHaveLength(4);
    expect(failed).toContain('oHg5SJYRHA0');
    expect(failed).not.toContain('URL không hợp lệ.');
    expect(metadata.counts).toMatchObject({ total: 3, success: 1, skipped: 1, failed: 1 });
  });
});
