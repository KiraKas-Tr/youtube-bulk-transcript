export type ItemStatus = 'pending' | 'processing' | 'success' | 'failed' | 'skipped' | 'cancelled';
export type OutputFormat = 'md' | 'txt' | 'json';

export type ProcessingSettings = {
  maxVideos: 50;
  concurrency: 2 | 3;
  retryCount: 1;
  timeoutMs: number;
};

export type BulkJob = {
  id: string;
  type: 'videos' | 'mixed';
  selectedLanguage: 'auto' | string;
  formats: OutputFormat[];
  createdAt: string;
  completedAt?: string;
  folderName?: string;
  settings: ProcessingSettings;
  items: JobItem[];
};

export type JobItem = {
  order: number;
  inputUrl: string;
  videoId?: string;
  canonicalUrl?: string;
  title?: string;
  channel?: string;
  language?: string;
  status: ItemStatus;
  error?: string;
  files?: { md?: string; txt?: string; json?: string };
};

export type TranscriptSegment = { start: number; duration?: number; text: string };

export type Transcript = {
  videoId: string;
  url: string;
  title: string;
  channel?: string;
  language: string;
  source: 'public_captions';
  segments: TranscriptSegment[];
};

export type Counts = Record<ItemStatus, number> & { total: number };

export const USER_ERRORS = {
  INVALID_URL: 'URL không hợp lệ.',
  NO_TRANSCRIPT: 'Video không có transcript public.',
  LANGUAGE_UNAVAILABLE: 'Không có transcript cho ngôn ngữ đã chọn.',
  UNAVAILABLE: 'Video private, deleted hoặc unavailable.',
  FETCH_FAILED: 'Không tải được transcript. Hãy thử lại sau.',
  WRITE_FAILED: 'Không ghi được file vào folder đã chọn.',
  PERMISSION_DENIED: 'User chưa cấp quyền ghi vào folder.',
  MAX_VIDEOS: 'Giới hạn tối đa 50 video mỗi job.',
  DUPLICATE: 'Duplicate video ID; skipped.',
  CANCELLED: 'Cancelled by user.',
} as const;

export type JobCallbacks = {
  onUpdate?: (job: BulkJob) => void;
  onItemUpdate?: (item: JobItem, job: BulkJob) => void;
};

export type JobWriter = {
  chooseParentFolder(): Promise<FileSystemDirectoryHandle>;
  createJobFolder(parent: FileSystemDirectoryHandle, job: BulkJob): Promise<FileSystemDirectoryHandle>;
  writeTranscriptFiles(jobFolder: FileSystemDirectoryHandle, item: JobItem, transcript: Transcript, job: BulkJob): Promise<JobItem>;
  writeReports(jobFolder: FileSystemDirectoryHandle, job: BulkJob): Promise<void>;
};
