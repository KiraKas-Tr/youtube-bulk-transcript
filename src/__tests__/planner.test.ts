import { describe, expect, it } from 'vitest';
import { planJob } from '../job/planner';

const A = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
const B = 'https://youtu.be/oHg5SJYRHA0';

describe('planJob', () => {
  it('preserves order, marks invalid rows skipped, and deduplicates by video ID', () => {
    const job = planJob([A, 'bad', 'https://youtu.be/dQw4w9WgXcQ?x=1', B], 'auto');
    expect(job.items.map((item) => item.order)).toEqual([1, 2, 3, 4]);
    expect(job.items.map((item) => item.status)).toEqual(['pending', 'skipped', 'skipped', 'pending']);
    expect(job.items[2].error).toContain('Duplicate');
  });

  it('supports an explicit max video cap when configured', () => {
    const ids = Array.from({ length: 51 }, (_, i) => `abcDEF_${String(i).padStart(3, '0')}`);
    const job = planJob(ids.map((id) => `https://www.youtube.com/watch?v=${id}`), 'en', {
      maxVideos: 50,
      concurrency: 2,
      retryCount: 1,
      timeoutMs: 25_000,
    });
    expect(job.items.filter((item) => item.status === 'pending')).toHaveLength(50);
    expect(job.items[50].status).toBe('skipped');
    expect(job.items[50].error).toBeTruthy();
  });

  it('does not cap normal jobs at 50 by default', () => {
    const ids = Array.from({ length: 51 }, (_, i) => `abcDEF_${String(i).padStart(3, '0')}`);
    const job = planJob(ids.map((id) => `https://www.youtube.com/watch?v=${id}`), 'en');
    expect(job.items.filter((item) => item.status === 'pending')).toHaveLength(51);
  });
});
