import type { Counts, JobItem, ItemStatus } from '../types';

const UNSAFE_FILENAME_CHARS = /[<>:"/\\|?*\u0000-\u001F]/g;

export function pad(number: number, width = 2): string {
  return String(number).padStart(width, '0');
}

export function formatJobTimestamp(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}`;
}

export function formatJobId(date = new Date()): string {
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}-${Math.random().toString(36).slice(2, 8)}`;
}

export function formatDisplayDateTime(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function getJobFolderName(date = new Date()): string {
  return `bulk-transcripts-${formatJobTimestamp(date)}`;
}

export function sanitizeFilenamePart(input: string | undefined, fallback: string, maxLength = 80): string {
  const value = (input ?? '').trim() || fallback;
  const safe = value
    .replace(UNSAFE_FILENAME_CHARS, '-')
    .replace(/\s+/g, ' ')
    .replace(/-+/g, '-')
    .replace(/^[ .-]+|[ .-]+$/g, '')
    .slice(0, maxLength)
    .replace(/[ .-]+$/g, '');
  return safe || fallback;
}

export function makeBaseFileName(item: JobItem): string {
  const fallback = `untitled-video-${item.videoId ?? item.order}`;
  const title = sanitizeFilenamePart(item.title, fallback, 80);
  return `${pad(item.order, 3)} - ${title}`;
}

export function formatTranscriptTimestamp(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = safe % 60;
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

export function getCounts(items: JobItem[]): Counts {
  const initial: Counts = {
    total: items.length,
    pending: 0,
    processing: 0,
    success: 0,
    failed: 0,
    skipped: 0,
    cancelled: 0,
  };
  return items.reduce((counts, item) => {
    counts[item.status] += 1;
    return counts;
  }, initial);
}

export function isTerminalStatus(status: ItemStatus): boolean {
  return status === 'success' || status === 'failed' || status === 'skipped' || status === 'cancelled';
}
