# PRD: Bulk YouTube Transcript Saver MVP

Source: `bulk_youtube_transcript_saver_mvp_plan.md`  
Version: v0.1 MVP  
Date: 2026-06-08

## 1. Problem

Users who need transcripts from many YouTube videos must currently copy transcripts one by one and manually organize files. This is slow and error-prone for creators, marketers, researchers, students, agencies, and VAs processing dozens of videos.

## 2. Product Summary

Build a local-first Chrome extension that lets a user paste multiple YouTube video links, choose a local folder, and save all available public YouTube captions/subtitles as Markdown, TXT, JSON, plus CSV/JSON reports.

The MVP must not require login, backend, payment, AI, or audio transcription.

## 3. Goals

- Process up to 50 YouTube video URLs in one job.
- Support common video URL formats: watch, `youtu.be`, and Shorts.
- Parse, validate, deduplicate, and preserve original input order.
- Let the user select a local parent folder with File System Access API.
- Create one predictable job folder per run.
- Save Markdown, TXT, and JSON transcript files for each successful video.
- Generate `index.csv`, `failed.csv`, and `metadata.json` for every job.
- Show per-video progress and errors without stopping the whole batch.
- Keep transcript extraction and file writing local to the browser extension.

## 4. Non-Goals for v0.1

- Accounts, login, authentication, or cloud history.
- Backend service, remote database, or server upload.
- AI summaries/chat/embeddings or user-provided AI keys.
- Audio transcription for videos without captions.
- Payments or billing.
- Instagram, TikTok, or other non-YouTube sources.
- Large channel crawling.
- Playlist/channel URL expansion as a committed v0.1 feature.
- ZIP/download fallback unless File System Access proves insufficient later.

## 5. Users and Use Cases

| User | Use case | Why bulk matters |
|---|---|---|
| Content creator | Collect competitor scripts. | Dozens of videos at once. |
| SEO / marketer | Gather text for keyword/topic research. | Searchable local exports. |
| Researcher / student | Save lecture/interview transcripts. | Organized local notes. |
| Agency / VA | Build client transcript packs. | Repeatable reports and exports. |

## 6. MVP Scope

### Inputs

Required:
- One YouTube URL per line.
- Mixed video URLs from multiple channels.
- URL formats:
  - `https://www.youtube.com/watch?v=<id>`
  - `https://youtu.be/<id>`
  - `https://www.youtube.com/shorts/<id>`
- Duplicate detection by video ID.
- Invalid URL detection and reporting.

Excluded from v0.1:
- Playlist URL import/expansion.
- Channel URL import/expansion.
- Latest-N channel scraping.

### Transcript source and language

- Source: public YouTube captions/subtitles only.
- Language selector: Auto, English, Vietnamese, or available caption language when known.
- If selected language is unavailable, mark the video failed with a language-unavailable error unless Auto can select another available track.

### Bulk processing rules

| Rule | MVP value |
|---|---|
| Max videos/job | 50 |
| Concurrency | 2-3 videos at a time |
| Retry | 1 retry per failed fetch |
| Timeout | 20-30 seconds per video |
| Duplicate handling | Skip duplicate video IDs; report skipped count/status |
| Failure handling | Per-video failure does not stop the job |
| Write behavior | Write successful video files immediately; write reports at job end |

## 7. UX / Flow

1. User opens extension page or side panel.
2. User pastes YouTube URLs, one per line.
3. Extension parses video IDs, removes duplicates, and marks invalid rows.
4. User selects language.
5. User confirms required output set: Markdown, TXT, JSON, CSV reports.
6. User clicks **Choose Folder** and selects a local parent folder.
7. User clicks **Start**.
8. Extension creates one job folder.
9. Extension processes videos with controlled concurrency.
10. Each successful video is written to disk immediately.
11. Extension writes `index.csv`, `failed.csv`, and `metadata.json`.
12. User sees final counts: total, success, failed, skipped, cancelled.

### Required UI elements

- URL textarea: “Paste YouTube URLs - one per line”.
- Language dropdown.
- Output indicators/checkboxes for Markdown, TXT, JSON, CSV reports.
- **Choose Folder**, **Start**, **Stop**, and **Retry failed** controls.
- Progress summary: total, success, failed, processing, skipped/cancelled.
- Result table columns: order, title, channel, language, status, error.

### Item states

`pending`, `processing`, `success`, `failed`, `skipped`, `cancelled`

### User-facing errors

| Condition | Message |
|---|---|
| Invalid URL | `URL không hợp lệ.` |
| No transcript | `Video không có transcript public.` |
| Language unavailable | `Không có transcript cho ngôn ngữ đã chọn.` |
| Private/deleted/unavailable | `Video private, deleted hoặc unavailable.` |
| Fetch failed | `Không tải được transcript. Hãy thử lại sau.` |
| Write failed | `Không ghi được file vào folder đã chọn.` |
| Permission denied | `User chưa cấp quyền ghi vào folder.` |

## 8. File and Folder Requirements

### Job folder

For v0.1 video/mixed URL jobs:

```text
bulk-transcripts-YYYY-MM-DD-HHmm
```

Playlist/channel naming utilities may be designed for future versions, but playlist/channel import is not v0.1 scope.

### Folder structure

```text
Selected Folder/
└── bulk-transcripts-YYYY-MM-DD-HHmm/
    ├── index.csv
    ├── failed.csv
    ├── metadata.json
    ├── markdown/
    │   └── 001 - Video Title.md
    ├── txt/
    │   └── 001 - Video Title.txt
    └── json/
        └── 001 - Video Title.json
```

### File naming rules

- Prefix with original job order: `001`, `002`, `003`.
- Limit base title to about 80 characters.
- Sanitize `< > : " / \ | ? *`.
- Fallback to `untitled-video-<video_id>` if title is empty.
- Avoid collisions by appending `-2`, `-3`, or `video_id`.

## 9. Output Requirements

### Markdown file

Include title, URL, video ID, channel when available, language, extracted timestamp, source (`public captions`), and timestamped transcript lines.

### TXT file

Include title, URL, language, and timestamped transcript lines.

### JSON file

Required shape:

```json
{
  "video_id": "abc123",
  "url": "https://www.youtube.com/watch?v=abc123",
  "title": "Video Title",
  "channel": "Channel Name",
  "language": "en",
  "source": "public_captions",
  "segments": [{ "start": 0, "duration": 4.2, "text": "Intro text..." }]
}
```

### `index.csv`

One row for every input item, including success, failed, skipped, and cancelled items.

Required fields:

```csv
job_id,order,video_id,title,channel,url,language,status,md_file,txt_file,json_file,error
```

### `failed.csv`

Only failed attempted items. Include `job_id`, `order`, `video_id`, `url`, title/channel/language when available, and `error`.

### `metadata.json`

Include job ID, timestamps, selected language, generated formats, folder name if available, counts by status, and processing settings: max videos, concurrency, retry count, timeout.

## 10. Functional Requirements

| ID | Requirement | Priority |
|---|---|---|
| FR-1 | Paste up to 50 YouTube video URLs, one per line. | Must |
| FR-2 | Extract video IDs from watch, `youtu.be`, and Shorts URLs. | Must |
| FR-3 | Deduplicate by video ID and report skipped duplicates. | Must |
| FR-4 | Flag invalid URLs without blocking valid URLs. | Must |
| FR-5 | Select language: Auto, English, Vietnamese, or available language. | Must |
| FR-6 | Select local parent folder using `showDirectoryPicker()`. | Must |
| FR-7 | Create one timestamped job folder per run. | Must |
| FR-8 | Fetch public captions and normalize timestamped segments. | Must |
| FR-9 | Save Markdown, TXT, and JSON for each successful video. | Must |
| FR-10 | Generate `index.csv`, `failed.csv`, and `metadata.json` for every job. | Must |
| FR-11 | Show per-video status and error messages. | Must |
| FR-12 | Continue processing after individual failures. | Must |
| FR-13 | Use low concurrency, timeout, and one retry per failed fetch. | Must |
| FR-14 | Allow user to stop/cancel an active job. | Should |
| FR-15 | Allow user to retry failed items. | Should |
| FR-16 | Remember last settings with `chrome.storage`. | Should |

## 11. Technical Considerations

### Platform

- Chrome Extension Manifest V3.
- UI: full extension page or side panel.
- No backend in v0.1.

### Main modules

| Module | Responsibility |
|---|---|
| URL parser | Extract IDs from supported URL formats. |
| Job planner | Deduplicate, cap, order, and create work items. |
| Caption resolver | Resolve metadata/caption tracks and select language. |
| Transcript normalizer | Convert captions into `{ start, duration, text }` segments. |
| File writer | Create folders, sanitize filenames, write outputs/reports. |
| Progress controller | Track item/job states. |
| Service worker | Queue coordination, fetch orchestration, retry/timeout, messaging. |

### APIs and permissions

Required:
- File System Access API / `showDirectoryPicker()`.
- `chrome.storage`.
- Narrow YouTube host permissions.

Manifest direction:

```json
{
  "manifest_version": 3,
  "name": "Bulk YouTube Transcript Saver",
  "version": "0.1.0",
  "permissions": ["storage"],
  "host_permissions": ["https://www.youtube.com/*", "https://youtube.com/*"]
}
```

Do not request `chrome.downloads` unless a later ZIP/download fallback is added.

### Suggested stack

WXT or Plasmo, React + TypeScript, Tailwind CSS, lightweight React state or Zustand, `chrome.storage`; IndexedDB only if needed for folder handles/job recovery; Vitest for parser/sanitizer tests.

## 12. Data Contracts

```ts
type BulkJob = {
  id: string;
  type: 'videos' | 'mixed';
  selectedLanguage: 'auto' | string;
  formats: Array<'md' | 'txt' | 'json'>;
  createdAt: string;
  items: JobItem[];
};

type JobItem = {
  order: number;
  inputUrl: string;
  videoId?: string;
  title?: string;
  channel?: string;
  language?: string;
  status: 'pending' | 'processing' | 'success' | 'failed' | 'skipped' | 'cancelled';
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

## 13. Acceptance Criteria

### Core processing

- User can run a job with up to 50 YouTube video URLs without login.
- Watch, `youtu.be`, and Shorts URLs produce valid video IDs.
- Mixed URL jobs create `bulk-transcripts-YYYY-MM-DD-HHmm` folders.
- Duplicate videos are skipped and do not create duplicate transcript files.
- Invalid URLs are reported while valid URLs still process.
- Failed videos do not stop the rest of the batch.
- Fetch failures retry once and respect a 20-30 second timeout.

### Output

- Each successful video writes one `.md`, one `.txt`, and one `.json` file into the correct subfolders.
- Every completed job writes `index.csv`, `failed.csv`, and `metadata.json`.
- `index.csv` includes every input item and file paths for successful outputs.
- `failed.csv` includes failed attempted items with enough context to diagnose/retry.
- `metadata.json` reflects job settings, timestamps, folder name, and final counts.

### Privacy and scope

- No transcript, URL, or metadata is uploaded to a server in v0.1.
- No account creation is required.
- No AI summary/chat and no audio transcription are included.

## 14. QA Checklist

- URL parsing: watch, `youtu.be`, Shorts, duplicate, invalid.
- Language: English, Vietnamese, auto captions, no captions, unavailable selected language.
- Folder/file naming: mixed job, same-minute jobs, long titles, unsafe characters, emoji, duplicate titles, empty titles.
- Bulk stability: 10, 25, and 50 video runs; network failures; retry failed only; cancellation.
- File writing: permission denied, folder reselected, large transcripts.
- Reports: all items in `index.csv`; failed-only rows in `failed.csv`; accurate `metadata.json`.
- Privacy: no login, no server upload, no unnecessary permissions.

## 15. Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| YouTube changes caption access. | Extractor may break. | Isolate YouTube adapter and test known captioned videos. |
| Many videos lack captions. | High failure count. | Clear failure report; keep audio transcription post-MVP. |
| Rate limiting/fetch instability. | Unreliable jobs. | Low concurrency, timeout, one retry, retry failed. |
| File System Access behavior varies. | Folder writes may fail. | Require explicit user gesture; consider ZIP fallback later. |
| Chrome Web Store permission review. | Launch delay. | Keep permissions narrow and document local-only behavior. |
| Users expect playlist/channel import. | Scope creep. | Position v0.1 as video-URL bulk; defer playlist/channel to post-MVP. |

## 16. Open Questions

- Are Markdown/TXT/JSON all mandatory, or can users disable some formats in v0.1?
- If more than 50 URLs are pasted, should start be blocked or should extras be marked skipped?
- For Auto language, should priority be manual captions, auto-generated captions, or first available track?
- Should invalid URLs/skipped duplicates appear only in `index.csv`, or also in `failed.csv`?

## 17. Post-MVP Direction

- v0.2: Playlist import, preview selected videos, cap job size.
- v0.3: Channel import, latest N videos, date filter, skip previously downloaded.
- v0.4: Resume jobs, persistent recent folder handle, better duplicate detection.
- v0.5: Optional ZIP/download fallback.
- v0.6: Optional AI using user-provided API key.
- v1.0: Paid cloud version with audio transcription for videos without captions.
