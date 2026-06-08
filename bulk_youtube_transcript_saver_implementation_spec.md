# Spec-Driven Development Plan: Bulk YouTube Transcript Saver MVP

Source: `bulk_youtube_transcript_saver_prd.md`  
Target: Chrome Extension MV3, v0.1 MVP  
Date: 2026-06-08

## 1. Implementation Objective

Build the v0.1 local-first Chrome extension described in the PRD: paste up to 50 YouTube video URLs, choose a local folder, extract available public captions, save Markdown/TXT/JSON files, and generate `index.csv`, `failed.csv`, and `metadata.json` without login, backend, AI, payment, or audio transcription.

## 2. Scope Boundaries

### In scope

- Extension page or side panel UI.
- URL parsing for YouTube watch, `youtu.be`, and Shorts URLs.
- Deduplication, invalid URL reporting, and ordered job planning.
- Language selection: Auto, English, Vietnamese, or resolved available caption language.
- File System Access API folder selection with `showDirectoryPicker()`.
- Timestamped `bulk-transcripts-YYYY-MM-DD-HHmm` job folders.
- Markdown, TXT, JSON transcript outputs.
- `index.csv`, `failed.csv`, `metadata.json` job reports.
- Per-video status table and progress summary.
- Low-concurrency queue, timeout, one retry, stop/cancel, retry failed.
- `chrome.storage` for last settings.

### Out of scope

- Login/accounts, backend, cloud storage/history, server upload.
- AI features or audio transcription.
- Payment/billing.
- Playlist/channel URL expansion.
- Non-YouTube sources.
- `chrome.downloads`/ZIP fallback unless explicitly added later.

## 3. Architecture Workstreams

```text
UI Layer
  ├─ URL input + settings + folder picker
  ├─ progress summary + result table
  └─ start/stop/retry failed actions

Application Layer
  ├─ job planner
  ├─ progress controller
  ├─ queue runner
  └─ settings store

YouTube Adapter
  ├─ metadata/caption-track resolver
  ├─ language selector
  └─ caption fetcher/parser

Output Layer
  ├─ file/folder naming
  ├─ markdown/txt/json renderers
  ├─ CSV report renderer
  └─ File System Access writer
```

Design rule: keep YouTube caption access isolated behind one adapter so YouTube behavior changes do not spread through the app.

## 4. Core Data Contracts

Use the PRD contracts as implementation types.

```ts
type ItemStatus = 'pending' | 'processing' | 'success' | 'failed' | 'skipped' | 'cancelled';

type BulkJob = {
  id: string;
  type: 'videos' | 'mixed';
  selectedLanguage: 'auto' | string;
  formats: Array<'md' | 'txt' | 'json'>;
  createdAt: string;
  completedAt?: string;
  folderName?: string;
  settings: ProcessingSettings;
  items: JobItem[];
};

type ProcessingSettings = {
  maxVideos: 50;
  concurrency: 2 | 3;
  retryCount: 1;
  timeoutMs: number; // 20000-30000
};

type JobItem = {
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

type Transcript = {
  videoId: string;
  url: string;
  title: string;
  channel?: string;
  language: string;
  source: 'public_captions';
  segments: Array<{ start: number; duration?: number; text: string }>;
};
```

## 5. Interfaces to Implement

### URL parser

```ts
parseYouTubeUrl(input: string):
  | { ok: true; videoId: string; canonicalUrl: string }
  | { ok: false; error: 'INVALID_URL' };
```

Acceptance checks:
- Extracts IDs from watch, `youtu.be`, and Shorts URLs.
- Rejects unsupported/invalid URLs.
- Handles whitespace and URL query noise.

### Job planner

```ts
planJob(inputs: string[], selectedLanguage: string): BulkJob;
```

Responsibilities:
- Preserve line order using 1-based `order`.
- Mark invalid rows as `failed` or `skipped` per final reporting decision.
- Deduplicate by `videoId`; first occurrence remains pending, later occurrences become `skipped`.
- Enforce max 50 video URLs according to the unresolved product decision in Section 11.
- Set job type to `mixed` when URLs can be from multiple channels; do not implement playlist/channel expansion.

### YouTube adapter

```ts
resolveTranscript(item: JobItem, language: string, signal: AbortSignal): Promise<Transcript>;
```

Responsibilities:
- Fetch video metadata when available: title, channel.
- Discover public caption tracks.
- Select caption track using language preference.
- Fetch caption data.
- Normalize to timestamped segments.
- Map failures to PRD user-facing errors.

Do not add audio transcription fallback.

### Queue runner

```ts
runJob(job: BulkJob, writer: JobWriter, callbacks: JobCallbacks): Promise<BulkJob>;
```

Responsibilities:
- Run 2-3 active video fetches at once.
- Apply 20-30 second timeout per video.
- Retry one time for fetch failures.
- Continue after failures.
- Support cancellation via `AbortController`.
- Write each successful video's files immediately.
- Write final reports after queue settles.

### File writer

```ts
type JobWriter = {
  chooseParentFolder(): Promise<FileSystemDirectoryHandle>;
  createJobFolder(parent: FileSystemDirectoryHandle, job: BulkJob): Promise<FileSystemDirectoryHandle>;
  writeTranscriptFiles(jobFolder: FileSystemDirectoryHandle, item: JobItem, transcript: Transcript): Promise<JobItem>;
  writeReports(jobFolder: FileSystemDirectoryHandle, job: BulkJob): Promise<void>;
};
```

Responsibilities:
- Create `bulk-transcripts-YYYY-MM-DD-HHmm`.
- Create `markdown/`, `txt/`, `json/` subfolders.
- Prefix file names with `001`, `002`, etc.
- Sanitize filename characters `< > : " / \ | ? *`.
- Limit title portion to about 80 characters.
- Use `untitled-video-<video_id>` fallback.
- Avoid collisions with suffixes.
- Surface write/permission errors.

### Renderers

```ts
renderMarkdown(transcript: Transcript, extractedAt: string): string;
renderTxt(transcript: Transcript): string;
renderJson(transcript: Transcript): string;
renderIndexCsv(job: BulkJob): string;
renderFailedCsv(job: BulkJob): string;
renderMetadataJson(job: BulkJob): string;
```

Acceptance checks:
- Markdown includes title, URL, video ID, channel when available, language, extracted timestamp, source, transcript lines.
- TXT includes title, URL, language, transcript lines.
- JSON matches PRD shape.
- `index.csv` includes every input item.
- `failed.csv` includes only failed attempted items unless product decision changes.
- `metadata.json` includes job ID, timestamps, selected language, formats, folder, counts, and processing settings.

## 6. Implementation Phases

### Phase 0: Project skeleton and decisions

Tasks:
1. Choose extension framework: WXT or Plasmo, with React + TypeScript.
2. Create MV3 extension skeleton with one extension page or side panel.
3. Configure `permissions: ["storage"]` and YouTube host permissions only.
4. Add test runner for pure functions.
5. Record decisions for Section 11 open questions before final UI polish.

Exit criteria:
- Extension builds and loads locally.
- UI shell renders.
- Manifest does not include backend/download/payment/AI-related permissions.

### Phase 1: Pure utilities

Tasks:
1. Implement URL parser.
2. Implement filename sanitizer and collision helper.
3. Implement timestamp/job folder formatter.
4. Implement transcript line timestamp formatter.
5. Implement CSV escaping utility.

Tests:
- Watch, `youtu.be`, Shorts, invalid URLs.
- Duplicate video IDs from different URL formats.
- Long titles, unsafe characters, emoji, empty title.
- CSV escaping for comma, quote, newline.

Exit criteria:
- Pure utility tests pass.

### Phase 2: Job planner and state model

Tasks:
1. Implement `BulkJob`, `JobItem`, and status transitions.
2. Implement `planJob` from textarea lines.
3. Deduplicate by video ID.
4. Represent invalid/skipped rows in UI/report state.
5. Add counts selector: total, pending, processing, success, failed, skipped, cancelled.
6. Persist last selected language/output settings in `chrome.storage`.

Tests:
- Mixed valid/invalid inputs.
- Duplicate handling preserves first occurrence.
- 50-item cap behavior after product decision.
- Counts update correctly.

Exit criteria:
- UI can preview planned rows and counts without fetching transcripts.

### Phase 3: Folder picker and file writer proof

Tasks:
1. Wire **Choose Folder** to `showDirectoryPicker()` from user gesture.
2. Create job folder and format subfolders.
3. Write a test file, then replace with real renderers.
4. Map permission/write errors to PRD messages.

Tests/manual checks:
- User can select a folder.
- Job folder is named `bulk-transcripts-YYYY-MM-DD-HHmm`.
- Subfolders are created.
- Permission denial is shown.

Exit criteria:
- A test job can create the expected folder tree locally.

### Phase 4: Output renderers and reports

Tasks:
1. Implement Markdown renderer.
2. Implement TXT renderer.
3. Implement JSON renderer.
4. Implement `index.csv`, `failed.csv`, and `metadata.json` renderers.
5. Integrate writer paths back into `JobItem.files`.

Tests:
- Successful video produces all three transcript files.
- Failed and skipped rows appear in `index.csv`.
- Failed attempted rows appear in `failed.csv`.
- Metadata counts match job state.

Exit criteria:
- Given mock transcripts, a job writes all required output files and reports.

### Phase 5: YouTube transcript adapter

Tasks:
1. Implement caption-track discovery for public captions.
2. Implement language selection.
3. Fetch caption data.
4. Normalize captions into `{ start, duration, text }` segments.
5. Resolve title/channel when available.
6. Map adapter failures to PRD error messages.

Manual/integration checks:
- English captions.
- Vietnamese captions.
- Auto captions.
- No captions.
- Selected language unavailable.
- Private/deleted/unavailable video.

Exit criteria:
- Single-video transcript extraction succeeds for known public-caption videos and fails clearly for unavailable/no-caption cases.

### Phase 6: Queue runner, progress, cancellation

Tasks:
1. Implement queue with concurrency 2-3.
2. Add per-video timeout of 20-30 seconds.
3. Retry failed fetch once.
4. Continue queue after failures.
5. Write successful files immediately.
6. Implement **Stop** using cancellation and mark unstarted/active items appropriately.
7. Implement **Retry failed** by planning a new run over failed attempted items.

Tests/manual checks:
- 10, 25, and 50 video runs.
- Network/fetch failure retries once.
- Cancellation updates statuses.
- Failed videos do not block successful videos.

Exit criteria:
- Full batch run produces correct progress, output files, and final reports.

### Phase 7: MVP hardening and packaging

Tasks:
1. Review permissions and privacy wording.
2. Add empty/error/loading states.
3. Add guardrails for missing folder, missing URLs, and no valid processable URLs.
4. Run QA checklist from PRD.
5. Prepare private beta build.

Exit criteria:
- Acceptance criteria in Section 8 pass.
- No unsupported features are present.

## 7. Dependency Order

1. Framework/manifest skeleton.
2. Pure utilities.
3. Job planner/state.
4. File System Access writer with mock data.
5. Output renderers/reports.
6. YouTube adapter.
7. Queue runner and progress integration.
8. Cancellation/retry failed.
9. QA and package.

Rationale: implement and test local deterministic components before depending on YouTube caption behavior.

## 8. Acceptance Checks Mapped to PRD

| PRD requirement | Implementation check |
|---|---|
| Up to 50 URLs | Planner enforces max; batch QA covers 50 videos. |
| Watch/`youtu.be`/Shorts | Parser unit tests. |
| Deduplicate | Planner marks later duplicates skipped. |
| Invalid URL reporting | Invalid rows appear in UI and `index.csv`. |
| Folder selection | `showDirectoryPicker()` runs from user click. |
| Job folder | Writer creates `bulk-transcripts-YYYY-MM-DD-HHmm`. |
| Markdown/TXT/JSON | Renderer tests and manual file inspection. |
| Reports | `index.csv`, `failed.csv`, `metadata.json` written every completed job. |
| Per-video errors | Adapter/runner maps failures to PRD messages. |
| Continue after failures | Queue test with mixed success/failure. |
| Low concurrency/retry/timeout | Queue test with fake adapter timers/failures. |
| Stop/cancel | AbortController manual/integration check. |
| Retry failed | New run over failed attempted items. |
| No backend/upload/login/AI/audio | Code/manifest review; no network calls except YouTube caption/metadata fetches. |

## 9. Edge Cases to Cover

- Empty textarea.
- All URLs invalid.
- More than 50 video URLs after dedupe.
- Same video in multiple URL formats.
- Duplicate video titles causing filename collision.
- Empty/missing title.
- Titles with unsafe filename characters or emoji.
- Captions exist but selected language does not.
- Video has no public captions.
- Private/deleted/unavailable video.
- Caption fetch timeout.
- User cancels folder picker.
- Folder permission denied or write failure after some files have been written.
- User presses Stop while items are processing.
- Retry failed after partial success.
- CSV fields containing commas, quotes, or newlines.

## 10. Minimum Test Plan

### Unit tests

- URL parser.
- Job planner and dedupe.
- Filename sanitizer/collision helper.
- Timestamp formatter.
- Markdown/TXT/JSON renderers.
- CSV escaping and report rendering.
- Metadata count generation.

### Integration/manual tests

- Folder picker and directory creation.
- Single public-caption video end-to-end.
- Mixed batch with success, no captions, invalid URL, duplicate.
- 10/25/50 video runs.
- Cancellation.
- Retry failed.
- Permission/write error handling where reproducible.

## 11. Product Decisions Needed Before Final Implementation

These are open in the PRD and should be resolved before finalizing the UI and planner behavior:

1. Are Markdown/TXT/JSON always generated, or can users disable formats?  
   - Current implementation default: generate all three and always generate CSV reports, matching PRD acceptance criteria.
2. If more than 50 URLs are pasted, should start be blocked or extras skipped?  
   - Implementation must not silently process more than 50.
3. For Auto language, should priority be manual captions, auto-generated captions, or first available track?
4. Should invalid URLs and skipped duplicates appear only in `index.csv`, or also in `failed.csv`?  
   - Current PRD says `failed.csv` contains failed attempted items only.

## 12. Implementation Risks

| Risk | Mitigation in implementation |
|---|---|
| YouTube caption access changes. | Keep all YouTube-specific logic in adapter; add known-video integration notes. |
| MV3/service worker lifetime issues. | Keep job state in UI/application layer where possible; persist minimal settings only for v0.1. |
| File System Access unavailable/permission denied. | Use explicit user gesture, clear errors, no silent fallback. |
| Partial writes before failure/cancel. | Write successful files immediately; final reports should reflect final item states. |
| Rate limiting/fetch instability. | Concurrency 2-3, timeout, one retry, retry failed. |
| Scope creep. | Block playlist/channel/audio/AI/backend/payments from v0.1 tasks. |

## 13. Definition of Done

The MVP implementation is done when:

- All Phase 1-7 exit criteria are met.
- PRD acceptance checks in Section 8 pass.
- A mixed batch can produce the required folder tree and reports.
- Failure cases are visible per video and represented in reports.
- No non-goal features or extra permissions are included.
- The project contains this implementation spec and the PRD as traceable source documents.
