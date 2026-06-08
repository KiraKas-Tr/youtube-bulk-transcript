import { describe, expect, it, vi } from 'vitest';
import type { BulkJob, JobWriter, Transcript } from '../types';
import { runJobInFolder } from '../job/queue';
import { TranscriptError } from '../youtube/adapter';

function makeTranscript(videoId: string): Transcript {
  return {
    videoId,
    url: `https://www.youtube.com/watch?v=${videoId}`,
    title: `Title ${videoId}`,
    language: 'en',
    source: 'public_captions',
    segments: [{ start: 0, text: 'hello' }],
  };
}

function makeJob(): BulkJob {
  return {
    id: 'job-queue',
    type: 'mixed',
    selectedLanguage: 'auto',
    formats: ['txt'],
    createdAt: new Date().toISOString(),
    settings: { maxVideos: 50, concurrency: 2, retryCount: 1, timeoutMs: 1000 },
    items: [
      { order: 1, inputUrl: 'https://youtu.be/aaaaaa11111', videoId: 'aaaaaa11111', canonicalUrl: 'https://www.youtube.com/watch?v=aaaaaa11111', status: 'pending' },
      { order: 2, inputUrl: 'https://youtu.be/bbbbbb22222', videoId: 'bbbbbb22222', canonicalUrl: 'https://www.youtube.com/watch?v=bbbbbb22222', status: 'pending' },
    ],
  };
}

describe('runJobInFolder', () => {
  it('retries once, continues after failure, writes successful TXT files, and updates statuses', async () => {
    const job = makeJob();
    const attempts = new Map<string, number>();
    const writer: JobWriter = {
      chooseParentFolder: vi.fn(),
      createJobFolder: vi.fn(),
      writeTranscriptFiles: vi.fn(async (_folder, item, transcript) => ({ ...item, title: transcript.title, language: transcript.language, files: { txt: 't' } })),
    };

    const finalJob = await runJobInFolder(job, {} as FileSystemDirectoryHandle, writer, {}, {
      resolver: async (item) => {
        const count = (attempts.get(item.videoId!) ?? 0) + 1;
        attempts.set(item.videoId!, count);
        if (item.videoId === 'aaaaaa11111' && count === 1) throw new TranscriptError('FETCH_FAILED');
        if (item.videoId === 'bbbbbb22222') throw new TranscriptError('NO_TRANSCRIPT');
        return makeTranscript(item.videoId!);
      },
    });

    expect(attempts.get('aaaaaa11111')).toBe(2);
    expect(finalJob.items.map((item) => item.status)).toEqual(['success', 'failed']);
    expect(writer.writeTranscriptFiles).toHaveBeenCalledTimes(1);
    expect(finalJob.completedAt).toBeTruthy();
  });
});
