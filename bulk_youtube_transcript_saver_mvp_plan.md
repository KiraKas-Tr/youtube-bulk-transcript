# Bulk YouTube Transcript Saver

**MVP Product & Technical Plan**  
*Local-first Chrome extension | No login | No backend | Save transcripts to user-selected folder*  

Prepared for: Ngo Trung  
Date: 2026-06-08

> **MVP statement**  
> Paste multiple YouTube links, choose a local folder, and save all available public transcripts as Markdown, TXT, JSON, plus CSV reports.

---

## 1. Executive Summary

> **Product direction**  
> Build a focused local-first Chrome extension for bulk transcript extraction. The first release should avoid login, backend, AI, payment, and audio transcription. The product value is speed and local file organization.

| Decision | Final MVP choice |
|---|---|
| Product type | Chrome extension with a full extension page or side panel |
| Core job | Bulk get transcript from YouTube videos |
| Storage model | Save directly to a folder selected by the user |
| Primary API choice | File System Access API / `showDirectoryPicker()` |
| Authentication | None |
| Backend | None for v0.1 |
| AI features | Out of scope for v0.1 |
| Transcript source | Public captions/subtitles available from YouTube |
| Batch limit | Recommended initial cap: 50 videos per job |

---

## 2. Goals and Non-Goals

### 2.1 Goals

- Allow users to paste many YouTube URLs and extract transcripts in one run.
- Allow the user to choose a folder on their computer and save all generated files there.
- Create a clean, predictable folder structure for each bulk job.
- Support at least Markdown, TXT, JSON, `index.csv`, `failed.csv`, and `metadata.json`.
- Show clear progress and errors per video without stopping the whole job.
- Run without account creation, remote database, or payment flow.

### 2.2 Non-Goals for v0.1

| Out of scope | Reason |
|---|---|
| Login/account system | Not needed for a local-first utility. |
| Cloud history/database | Increases complexity and privacy concerns. |
| AI summary/chat | Useful later, but not required to validate bulk transcript workflow. |
| Audio transcription | Requires backend compute and introduces cost. |
| Payments/billing | Can be added after demand is validated. |
| Instagram/TikTok support | Unstable surface area and unnecessary for first validation. |
| Large channel crawling | Start with capped jobs to reduce rate-limit and reliability issues. |

---

## 3. Target Users and Use Cases

| User segment | Use case | Why bulk matters |
|---|---|---|
| Content creator | Analyze competitor videos and collect scripts. | They often process dozens of videos. |
| SEO / marketer | Collect transcripts for keyword and topic research. | Manual copy is slow and repetitive. |
| Researcher / student | Download lecture/interview transcripts for reading and notes. | They need organized local files. |
| Agency / VA | Prepare transcript packs for clients. | Needs repeatable exports and clean reports. |

---

## 4. MVP Scope

### 4.1 Supported Inputs

| Input type | v0.1 support | Notes |
|---|---|---|
| Multiple video URLs | Required | One URL per line. Support watch URLs, `youtu.be`, and Shorts URLs. |
| Playlist URL | Optional in v0.1 / recommended v0.2 | If included early, cap number of videos and show review list. |
| Channel URL | Optional in v0.1 / recommended v0.2 | Can be supported later after video-list resolution is stable. |
| Mixed URLs | Required | User can paste videos from multiple channels. |

> **Recommended v0.1 cut**  
> Build video-URL bulk first. Add playlist/channel import once transcript extraction and local saving are stable. Still design folder naming now so v0.2 fits cleanly.

### 4.2 Required Output Formats

| Output | Required? | Purpose |
|---|---:|---|
| `.md` | Yes | Human-friendly transcript with metadata and timestamps. |
| `.txt` | Yes | Plain transcript for quick copy/search. |
| `.json` | Yes | Structured segments for later automation/AI. |
| `index.csv` | Yes | Master report for all successful and failed videos. |
| `failed.csv` | Yes | Quick list of failed items and retry reasons. |
| `metadata.json` | Yes | Job-level metadata for audit/resume/future import. |

---

## 5. User Experience Flow

1. User opens the extension page or side panel.
2. User pastes YouTube URLs, one per line.
3. Extension parses, deduplicates, and validates video IDs.
4. User chooses transcript language: Auto, English, Vietnamese, or available caption language.
5. User selects output formats: Markdown, TXT, JSON, CSV reports.
6. User clicks **Choose Folder** and selects a local parent folder.
7. Extension creates one job folder inside the selected folder.
8. Extension extracts transcripts with controlled concurrency.
9. Each video result is written immediately to disk after success.
10. At the end, extension writes `index.csv`, `failed.csv`, and `metadata.json`.
11. User sees final result summary and can open the selected folder manually from OS file explorer.

```text
UI sketch

Bulk YouTube Transcript Saver

[ Paste YouTube URLs - one per line ]
https://www.youtube.com/watch?v=...
https://youtu.be/...
https://www.youtube.com/shorts/...

Language: [ Auto v ]
Output:   [x] Markdown  [x] TXT  [x] JSON  [x] CSV reports
Folder:   [ Choose Folder ]  /Users/.../YouTube Transcripts

[ Start ] [ Stop ] [ Retry failed ]

Progress: 50 total | 42 success | 5 failed | 3 processing

Video title | Channel | Language | Status | Error
```

---

## 6. Folder and File Naming Strategy

> **Core rule**  
> Every bulk run creates one subfolder. The subfolder name should describe the source when possible. If the input is mixed URLs, use a generic timestamped `bulk-transcripts` folder.

| Source type | Folder name format | Example |
|---|---|---|
| Single channel | `<channel-name> - YYYY-MM-DD-HHmm` | `Ali Abdaal - 2026-06-08-1530` |
| Single playlist | `<playlist-name> - YYYY-MM-DD-HHmm` | `React Tutorial Playlist - 2026-06-08-1605` |
| Mixed URLs | `bulk-transcripts-YYYY-MM-DD-HHmm` | `bulk-transcripts-2026-06-08-1712` |
| Unknown playlist name | `playlist-<playlist-id> - YYYY-MM-DD-HHmm` | `playlist-PLabc123 - 2026-06-08-1605` |
| Unknown channel name | `channel-<channel-id> - YYYY-MM-DD-HHmm` | `channel-UCabc123 - 2026-06-08-1530` |

Recommended folder structure:

```text
Selected Folder/
└── <job-folder-name>/
    ├── index.csv
    ├── failed.csv
    ├── metadata.json
    ├── markdown/
    │   ├── 001 - Video Title.md
    │   └── 002 - Video Title.md
    ├── txt/
    │   ├── 001 - Video Title.txt
    │   └── 002 - Video Title.txt
    └── json/
        ├── 001 - Video Title.json
        └── 002 - Video Title.json
```

### File naming rules

| Rule | Implementation note |
|---|---|
| Prefix files with `001`, `002`, `003` | Preserves original job order when sorted by name. |
| Limit file title length | Recommended max base name: 80 characters. |
| Sanitize unsafe characters | Replace `< > : " / \ | ? *` with hyphen or remove. |
| Avoid empty names | Fallback to `untitled-video-<video_id>`. |
| Avoid overwrite collisions | If filename exists, append `-2`, `-3` or include `video_id`. |

```ts
function getJobFolderName(job) {
  const timestamp = formatDateTime(new Date()); // YYYY-MM-DD-HHmm

  if (job.type === 'channel' && job.channelName) {
    return `${sanitizeName(job.channelName)} - ${timestamp}`;
  }

  if (job.type === 'playlist' && job.playlistName) {
    return `${sanitizeName(job.playlistName)} - ${timestamp}`;
  }

  return `bulk-transcripts-${timestamp}`;
}
```

---

## 7. Output File Templates

### 7.1 Markdown Transcript

```md
# Video Title

URL: https://www.youtube.com/watch?v=abc123
Video ID: abc123
Channel: Channel Name
Language: en
Extracted at: 2026-06-08 15:30
Source: public captions

## Transcript

[00:00] Intro text...
[00:12] More transcript...
[01:05] Another segment...
```

### 7.2 TXT Transcript

```text
Video Title
https://www.youtube.com/watch?v=abc123
Language: en

[00:00] Intro text...
[00:12] More transcript...
[01:05] Another segment...
```

### 7.3 JSON Transcript

```json
{
  "video_id": "abc123",
  "url": "https://www.youtube.com/watch?v=abc123",
  "title": "Video Title",
  "channel": "Channel Name",
  "language": "en",
  "source": "public_captions",
  "segments": [
    { "start": 0, "duration": 4.2, "text": "Intro text..." }
  ]
}
```

### 7.4 `index.csv` Fields

```csv
job_id,order,video_id,title,channel,url,language,status,md_file,txt_file,json_file,error
20260608-1530,1,abc123,Video Title,Channel Name,https://youtube.com/watch?v=abc123,en,success,markdown/001 - Video Title.md,txt/001 - Video Title.txt,json/001 - Video Title.json,
20260608-1530,2,def456,Unavailable Video,,https://youtube.com/watch?v=def456,,failed,,,,No transcript available
```

---

## 8. Technical Architecture

```text
Chrome Extension MV3
├── Extension Page / Side Panel
│   ├── URL input
│   ├── folder picker
│   ├── settings
│   ├── progress table
│   └── result summary
│
├── Service Worker
│   ├── queue coordination
│   ├── fetch orchestration
│   ├── retry/timeout
│   └── message passing
│
├── Transcript Extractor
│   ├── parse video ID
│   ├── resolve metadata
│   ├── find caption tracks
│   ├── fetch caption data
│   └── normalize segments
│
├── File Writer
│   ├── create job folder
│   ├── create format subfolders
│   ├── write per-video files
│   └── write CSV/metadata reports
│
└── Local Storage / IndexedDB
    ├── last settings
    ├── recent folder handle where permitted
    └── last job state for recovery
```

| Module | Responsibility |
|---|---|
| URL parser | Extract video IDs from watch, `youtu.be`, Shorts, and embedded URL patterns. |
| Job planner | Deduplicate URLs, determine job type, create ordered work items. |
| Caption resolver | Find available captions and select language based on user preference. |
| Transcript normalizer | Convert source captions into segments with start, duration, text. |
| File writer | Write output files to the selected directory with safe names. |
| Progress controller | Track pending, processing, success, failed, skipped states. |

---

## 9. Browser APIs and Permissions

| API / permission | Use | MVP recommendation |
|---|---|---|
| File System Access API | Let user select a folder and write multiple files inside it. | Primary choice for local folder saving. |
| `showDirectoryPicker()` | Open the folder picker and return a directory handle. | Use from the extension page/side panel after user click. |
| `chrome.storage` | Save settings such as language and output formats. | Required. |
| `host_permissions` | Allow requests to YouTube pages/caption endpoints. | Keep as narrow as practical. |
| `chrome.downloads` | Fallback for ZIP/download-based export. | Not required if File System Access works; consider fallback later. |

```json
{
  "manifest_version": 3,
  "name": "Bulk YouTube Transcript Saver",
  "version": "0.1.0",
  "permissions": ["storage"],
  "host_permissions": [
    "https://www.youtube.com/*",
    "https://youtube.com/*"
  ]
}
```

> **Permission principle**  
> Request the minimum permissions needed. If a fallback download mode is added, declare the `downloads` permission only then.

---

## 10. Bulk Processing Rules

| Setting | Recommended v0.1 value |
|---|---|
| Max videos per job | 50 |
| Concurrency | 2–3 videos at a time |
| Retry | 1 retry per failed fetch |
| Timeout | 20–30 seconds per video |
| Duplicate handling | Skip duplicate video IDs and report skipped count |
| Failure handling | A failed video does not stop the job |
| Write behavior | Write each successful video immediately; write reports at the end and update if needed |

```text
Job states

pending      = waiting to run
processing   = currently extracting transcript
success      = transcript saved
failed       = attempted but failed
skipped      = duplicate or invalid item skipped
cancelled    = user stopped the job
```

| Error | User-facing message |
|---|---|
| Invalid URL | URL không hợp lệ. |
| No transcript | Video không có transcript public. |
| Language unavailable | Không có transcript cho ngôn ngữ đã chọn. |
| Private/deleted video | Video private, deleted hoặc unavailable. |
| Fetch failed | Không tải được transcript. Hãy thử lại sau. |
| Write failed | Không ghi được file vào folder đã chọn. |
| Permission denied | User chưa cấp quyền ghi vào folder. |

---

## 11. Internal Data Contracts

```ts
type BulkJob = {
  id: string;
  type: 'videos' | 'playlist' | 'channel' | 'mixed';
  sourceUrl?: string;
  channelName?: string;
  playlistName?: string;
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
  status: 'pending' | 'processing' | 'success' | 'failed' | 'skipped';
  error?: string;
  files?: {
    md?: string;
    txt?: string;
    json?: string;
  };
};

type Transcript = {
  videoId: string;
  url: string;
  title: string;
  channel?: string;
  language: string;
  source: 'public_captions';
  segments: Array<{
    start: number;
    duration?: number;
    text: string;
  }>;
};
```

---

## 12. Implementation Roadmap

| Phase | Scope | Exit criteria |
|---|---|---|
| Phase 1: Local skeleton | Extension page, URL input, settings, progress table, folder picker. | Can choose folder and create a test job folder/file. |
| Phase 2: URL parser | Parse YouTube URL formats, dedupe, validate, show preview list. | Correctly extracts video IDs from common URL formats. |
| Phase 3: Transcript extractor | Resolve captions, select language, normalize segments. | Can extract transcript for public caption videos. |
| Phase 4: File writer | Write Markdown/TXT/JSON and job reports. | One bulk run creates the expected folder tree. |
| Phase 5: Reliability | Concurrency, retries, cancellation, `failed.csv`, error handling. | 50-video test job completes with clear per-video statuses. |
| Phase 6: Beta packaging | Icon, manifest, privacy text, Chrome Web Store-ready package. | Installable extension build ready for private beta. |

---

## 13. QA Checklist

| Area | Test cases |
|---|---|
| URL parsing | watch URL, `youtu.be` URL, Shorts URL, duplicate URLs, invalid URLs. |
| Folder naming | channel, playlist, mixed, unknown names, duplicate job same minute. |
| File naming | long titles, special characters, emoji, duplicate video titles. |
| Transcript extraction | English captions, Vietnamese captions, auto captions, no captions. |
| Bulk stability | 10, 25, 50 videos; network failures; retry failed only. |
| File writing | Permission denied, folder reselected, large transcript files. |
| Reports | `index.csv` contains all items, `failed.csv` only failed items, `metadata.json` accurate. |
| Privacy | No login, no server upload, no unnecessary browsing-data collection. |

---

## 14. Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| YouTube changes caption access behavior | Extractor may break. | Isolate platform adapter and add tests with known videos. |
| Many videos lack captions | User sees many failures. | Make failure report clear; add audio transcription only in later paid/cloud version. |
| Rate limiting or temporary fetch failures | Bulk jobs become unreliable. | Use low concurrency, retry once, and allow retry failed only. |
| File System Access permission behavior varies | Folder saving may fail for some users. | Use explicit user gesture; add downloads/ZIP fallback later. |
| Chrome Web Store review issues | Launch delay. | Keep permissions narrow, explain single purpose, and publish privacy policy. |
| User expects channel/playlist in v0.1 | Scope creep. | Position v0.1 as video-URL bulk; add playlist/channel as v0.2. |

---

## 15. Post-MVP Roadmap

| Version | Feature set |
|---|---|
| v0.2 | Playlist import, preview selected videos, cap job size. |
| v0.3 | Channel import, choose latest N videos, date filter, skip previously downloaded. |
| v0.4 | Resume jobs, persistent recent folder handle, retry failed only, better duplicate detection. |
| v0.5 | Optional ZIP export fallback via downloads API. |
| v0.6 | Optional AI using user-provided API key; summarize each transcript locally/cloud-by-user-key. |
| v1.0 | Paid cloud version with audio transcription for videos without captions. |

---

## 16. Suggested Tech Stack

| Layer | Recommendation |
|---|---|
| Extension framework | WXT or Plasmo, with React + TypeScript. |
| UI | React, Tailwind CSS, simple table/progress components. |
| State | Zustand or lightweight React state for v0.1. |
| Storage | `chrome.storage` for settings; IndexedDB only if saving folder handles/job recovery. |
| Build | Vite-based extension build. |
| Testing | Vitest for parser/sanitizer; manual integration tests for YouTube caption extraction. |

---

## 17. MVP Acceptance Criteria

- User can paste at least 50 YouTube video URLs.
- Extension extracts available public transcripts without requiring login.
- User can choose a local folder and the extension creates a job subfolder.
- Mixed URL jobs create folder named `bulk-transcripts-YYYY-MM-DD-HHmm`.
- Channel jobs eventually create folder named `<channel-name> - YYYY-MM-DD-HHmm`.
- Playlist jobs eventually create folder named `<playlist-name> - YYYY-MM-DD-HHmm`.
- Each successful video saves Markdown, TXT, and JSON files into separate subfolders.
- `index.csv`, `failed.csv`, and `metadata.json` are generated for every job.
- Failures are displayed per video and do not stop the whole batch.
- The extension does not upload transcripts to a server in v0.1.

---

## 18. Reference Notes

These references should be checked again before final Chrome Web Store submission because browser platform policies and APIs can change.

| Topic | Reference |
|---|---|
| Manifest V3 | Chrome for Developers: Extensions / Manifest V3 — https://developer.chrome.com/docs/extensions/develop/migrate/what-is-mv3 |
| File System Access API | Chrome for Developers: File System Access API — https://developer.chrome.com/docs/capabilities/web-apis/file-system-access |
| Downloads API fallback | Chrome Extensions API: `chrome.downloads` — https://developer.chrome.com/docs/extensions/reference/api/downloads |
| Chrome Web Store policies | Chrome Web Store Developer Program Policies — https://developer.chrome.com/docs/webstore/program-policies/policies |

---

## 19. Recommended Next Step

> **Build first**  
> Start with video-URL bulk only: parser + folder picker + transcript extraction + file writer. Do not add AI, login, channel crawling, or billing until this local workflow feels reliable.
