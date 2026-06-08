import type { BulkJob, JobItem, JobWriter, Transcript } from '../types';
import { USER_ERRORS } from '../types';
import { getJobFolderName, makeBaseFileName } from '../utils/format';
import { renderTxt } from './renderers';

async function writeTextFile(dir: FileSystemDirectoryHandle, name: string, contents: string): Promise<void> {
  const file = await dir.getFileHandle(name, { create: true });
  const writable = await file.createWritable();
  await writable.write(contents);
  await writable.close();
}

async function exists(dir: FileSystemDirectoryHandle, name: string): Promise<boolean> {
  try {
    await dir.getFileHandle(name, { create: false });
    return true;
  } catch {
    try {
      await dir.getDirectoryHandle(name, { create: false });
      return true;
    } catch {
      return false;
    }
  }
}

async function uniqueDirectoryName(parent: FileSystemDirectoryHandle, baseName: string): Promise<string> {
  if (!(await exists(parent, baseName))) return baseName;
  for (let i = 2; i < 1000; i += 1) {
    const candidate = `${baseName}-${i}`;
    if (!(await exists(parent, candidate))) return candidate;
  }
  return `${baseName}-${Date.now()}`;
}

async function uniqueFileName(dir: FileSystemDirectoryHandle, baseName: string, extension: string): Promise<string> {
  const first = `${baseName}.${extension}`;
  if (!(await exists(dir, first))) return first;
  for (let i = 2; i < 1000; i += 1) {
    const candidate = `${baseName}-${i}.${extension}`;
    if (!(await exists(dir, candidate))) return candidate;
  }
  return `${baseName}-${Date.now()}.${extension}`;
}

function mapWriteError(error: unknown): Error {
  const name = error instanceof DOMException ? error.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return new Error(USER_ERRORS.PERMISSION_DENIED);
  }
  return new Error(USER_ERRORS.WRITE_FAILED);
}

export const browserJobWriter: JobWriter = {
  async chooseParentFolder() {
    const picker = window.showDirectoryPicker;
    if (!picker) {
      throw new Error('File System Access API is not available in this browser.');
    }
    try {
      return await picker({ mode: 'readwrite' });
    } catch (error) {
      throw mapWriteError(error);
    }
  },

  async createJobFolder(parent, job) {
    try {
      const base = getJobFolderName(new Date(job.createdAt));
      const folderName = await uniqueDirectoryName(parent, base);
      const jobFolder = await parent.getDirectoryHandle(folderName, { create: true });
      job.folderName = folderName;
      return jobFolder;
    } catch (error) {
      throw mapWriteError(error);
    }
  },

  async writeTranscriptFiles(jobFolder, item, transcript, job) {
    try {
      const base = makeBaseFileName({ ...item, title: transcript.title, videoId: transcript.videoId });
      const files: JobItem['files'] = {};

      const name = await uniqueFileName(jobFolder, base, 'txt');
      await writeTextFile(jobFolder, name, renderTxt(transcript));
      files.txt = name;

      return {
        ...item,
        videoId: transcript.videoId,
        canonicalUrl: transcript.url,
        title: transcript.title,
        channel: transcript.channel,
        language: transcript.language,
        files,
      };
    } catch (error) {
      throw mapWriteError(error);
    }
  },
};
