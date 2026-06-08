import type { BulkJob, JobCallbacks, JobItem, JobWriter, Transcript } from '../types';
import { USER_ERRORS } from '../types';
import { resolveTranscript, toUserFacingTranscriptError } from '../youtube/adapter';

export type TranscriptResolver = (item: JobItem, language: string, signal: AbortSignal) => Promise<Transcript>;

export type RunJobOptions = {
  signal?: AbortSignal;
  resolver?: TranscriptResolver;
  jobFolder?: FileSystemDirectoryHandle;
};

function cloneJob(job: BulkJob): BulkJob {
  return { ...job, items: job.items.map((item) => ({ ...item, files: item.files ? { ...item.files } : undefined })) };
}

function notify(job: BulkJob, item: JobItem | undefined, callbacks: JobCallbacks): void {
  if (item) callbacks.onItemUpdate?.(item, cloneJob(job));
  callbacks.onUpdate?.(cloneJob(job));
}

function abortError(): DOMException {
  return new DOMException('Operation aborted', 'AbortError');
}

async function withTimeout<T>(timeoutMs: number, parentSignal: AbortSignal | undefined, operation: (signal: AbortSignal) => Promise<T>): Promise<T> {
  if (parentSignal?.aborted) throw abortError();

  const controller = new AbortController();
  let timedOut = false;
  const timer = window.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  const onAbort = () => controller.abort();
  parentSignal?.addEventListener('abort', onAbort, { once: true });

  try {
    return await operation(controller.signal);
  } catch (error) {
    if (parentSignal?.aborted) throw abortError();
    if (timedOut) throw new Error(USER_ERRORS.FETCH_FAILED);
    throw error;
  } finally {
    window.clearTimeout(timer);
    parentSignal?.removeEventListener('abort', onAbort);
  }
}

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

async function resolveWithRetry(item: JobItem, job: BulkJob, signal: AbortSignal | undefined, resolver: TranscriptResolver): Promise<Transcript> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= job.settings.retryCount; attempt += 1) {
    try {
      return await withTimeout(job.settings.timeoutMs, signal, (attemptSignal) => resolver(item, job.selectedLanguage, attemptSignal));
    } catch (error) {
      if (isAbort(error) || signal?.aborted) throw error;
      lastError = error;
    }
  }
  throw lastError;
}

function markRemainingCancelled(job: BulkJob): void {
  for (const item of job.items) {
    if (item.status === 'pending' || item.status === 'processing') {
      item.status = 'cancelled';
      item.error = USER_ERRORS.CANCELLED;
    }
  }
}

async function runJobInternal(
  job: BulkJob,
  jobFolder: FileSystemDirectoryHandle,
  writer: JobWriter,
  callbacks: JobCallbacks,
  options: RunJobOptions,
): Promise<BulkJob> {
  const resolver = options.resolver ?? resolveTranscript;
  const processable = job.items.filter((item) => item.status === 'pending');
  let cursor = 0;

  const worker = async () => {
    while (cursor < processable.length) {
      if (options.signal?.aborted) return;
      const item = processable[cursor];
      cursor += 1;

      item.status = 'processing';
      item.error = undefined;
      notify(job, item, callbacks);

      try {
        const transcript = await resolveWithRetry(item, job, options.signal, resolver);
        const written = await writer.writeTranscriptFiles(jobFolder, item, transcript, job);
        Object.assign(item, written, { status: 'success', error: undefined });
      } catch (error) {
        if (isAbort(error) || options.signal?.aborted) {
          item.status = 'cancelled';
          item.error = USER_ERRORS.CANCELLED;
        } else {
          item.status = 'failed';
          item.error = error instanceof Error && (error.message === USER_ERRORS.WRITE_FAILED || error.message === USER_ERRORS.PERMISSION_DENIED)
            ? error.message
            : toUserFacingTranscriptError(error);
        }
      }

      notify(job, item, callbacks);
    }
  };

  const concurrency = Math.min(job.settings.concurrency, processable.length || 1);
  await Promise.all(Array.from({ length: concurrency }, () => worker()));

  if (options.signal?.aborted) {
    markRemainingCancelled(job);
  }

  job.completedAt = new Date().toISOString();
  notify(job, undefined, callbacks);
  return cloneJob(job);
}

export async function runJob(job: BulkJob, writer: JobWriter, callbacks: JobCallbacks = {}, options: RunJobOptions = {}): Promise<BulkJob> {
  if (!options.jobFolder) {
    throw new Error('Missing job folder. Create one with writer.createJobFolder() before starting the queue.');
  }
  return runJobInternal(job, options.jobFolder, writer, callbacks, options);
}

export async function runJobInFolder(
  job: BulkJob,
  jobFolder: FileSystemDirectoryHandle,
  writer: JobWriter,
  callbacks: JobCallbacks = {},
  options: Omit<RunJobOptions, 'jobFolder'> = {},
): Promise<BulkJob> {
  return runJobInternal(job, jobFolder, writer, callbacks, options);
}
