import { describe, expect, it } from 'vitest';
import type { Transcript } from '../types';
import { csvEscape } from '../utils/csv';
import { formatJobTimestamp, formatTranscriptTimestamp, sanitizeFilenamePart } from '../utils/format';
import { renderTxt } from '../output/renderers';

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

describe('format utilities and TXT renderer', () => {
  it('formats timestamps and sanitizes filenames', () => {
    expect(formatJobTimestamp(new Date('2026-06-08T15:30:00'))).toBe('2026-06-08-1530');
    expect(formatTranscriptTimestamp(65)).toBe('01:05');
    expect(formatTranscriptTimestamp(3661)).toBe('01:01:01');
    expect(sanitizeFilenamePart('<bad>: name / file?', 'fallback')).toBe('bad- name - file');
  });

  it('escapes CSV fields', () => {
    expect(csvEscape('a,"b"\nc')).toBe('"a,""b""\nc"');
  });

  it('renders transcript-only TXT files', () => {
    expect(renderTxt(transcript)).toBe('[00:00] Intro text\n[01:05] More text\n');
  });
});
