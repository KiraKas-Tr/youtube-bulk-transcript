import { useEffect, useMemo, useRef, useState } from 'react';
import type { BulkJob, Counts } from './types';
import { getCounts } from './utils/format';
import { planJob } from './job/planner';
import { runJobInFolder } from './job/queue';
import { browserJobWriter } from './output/writer';
import { loadSettings, saveSettings } from './storage/settings';
import './style.css';

const SAMPLE_INPUT = '';
const CAPTURED_URLS_KEY = 'capturedYoutubeUrls';

function emptyCounts(): Counts {
  return { total: 0, pending: 0, processing: 0, success: 0, failed: 0, skipped: 0, cancelled: 0 };
}

function effectiveLanguage(selectedLanguage: string, customLanguage: string): string {
  if (selectedLanguage === 'custom') return customLanguage.trim() || 'auto';
  return selectedLanguage;
}

export function App() {
  const [urls, setUrls] = useState(SAMPLE_INPUT);
  const [selectedLanguage, setSelectedLanguage] = useState('auto');
  const [customLanguage, setCustomLanguage] = useState('');
  const [parentFolder, setParentFolder] = useState<FileSystemDirectoryHandle | null>(null);
  const [job, setJob] = useState<BulkJob | null>(null);
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState<string>('');
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    loadSettings().then((settings) => {
      setSelectedLanguage(settings.selectedLanguage);
      setCustomLanguage(settings.customLanguage);
    });

    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      chrome.storage.local.get({ [CAPTURED_URLS_KEY]: [] }).then((values) => {
        const captured = Array.isArray(values[CAPTURED_URLS_KEY]) ? values[CAPTURED_URLS_KEY].filter((url): url is string => typeof url === 'string') : [];
        if (captured.length) {
          setUrls(captured.join('\n'));
          setMessage(`Loaded ${captured.length} captured YouTube URL${captured.length === 1 ? '' : 's'} from the YouTube navbar button.`);
        }
      });
    }
  }, []);

  useEffect(() => {
    void saveSettings({ selectedLanguage, customLanguage });
  }, [selectedLanguage, customLanguage]);

  const previewJob = useMemo(() => {
    const inputs = urls.split(/\r?\n/);
    return planJob(inputs, effectiveLanguage(selectedLanguage, customLanguage));
  }, [urls, selectedLanguage, customLanguage]);

  const visibleJob = job ?? previewJob;
  const counts = visibleJob ? getCounts(visibleJob.items) : emptyCounts();
  const hasPending = previewJob.items.some((item) => item.status === 'pending');
  const failedCount = job?.items.filter((item) => item.status === 'failed').length ?? 0;

  async function chooseFolder() {
    setMessage('');
    try {
      const folder = await browserJobWriter.chooseParentFolder();
      setParentFolder(folder);
      setMessage(`Folder selected: ${folder.name}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not choose folder.');
    }
  }

  async function startJobFromInputs(inputLines: string[]) {
    if (!parentFolder) {
      setMessage('Choose a folder before starting.');
      return;
    }

    const nextJob = planJob(inputLines, effectiveLanguage(selectedLanguage, customLanguage));
    if (!nextJob.items.some((item) => item.status === 'pending')) {
      setJob(nextJob);
      setMessage('No valid, non-duplicate YouTube videos to process.');
      return;
    }

    const controller = new AbortController();
    controllerRef.current = controller;
    setRunning(true);
    setMessage('Creating job folder...');
    setJob({ ...nextJob, items: nextJob.items.map((item) => ({ ...item })) });

    try {
      const jobFolder = await browserJobWriter.createJobFolder(parentFolder, nextJob);
      setJob({ ...nextJob, items: nextJob.items.map((item) => ({ ...item })) });
      setMessage(`Running job in ${nextJob.folderName ?? jobFolder.name}...`);
      const finalJob = await runJobInFolder(
        nextJob,
        jobFolder,
        browserJobWriter,
        {
          onUpdate: (updatedJob) => setJob(updatedJob),
        },
        { signal: controller.signal },
      );
      setJob(finalJob);
      setMessage(controller.signal.aborted ? 'Job stopped. Reports were written with final statuses.' : 'Job completed. Reports written.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Job failed.');
    } finally {
      controllerRef.current = null;
      setRunning(false);
    }
  }

  function start() {
    void startJobFromInputs(urls.split(/\r?\n/));
  }

  function stop() {
    controllerRef.current?.abort();
    setMessage('Stopping current job...');
  }

  function retryFailed() {
    if (!job) return;
    const failedInputs = job.items.filter((item) => item.status === 'failed').map((item) => item.inputUrl);
    if (!failedInputs.length) {
      setMessage('No failed attempted items to retry.');
      return;
    }
    void startJobFromInputs(failedInputs);
  }

  return (
    <main className="app-shell">
      <header className="hero">
        <div>
          <p className="eyebrow">Chrome MV3 · local-first</p>
          <h1>Bulk YouTube Transcript Saver</h1>
          <p>Paste up to 50 YouTube video URLs, fetch public captions, and save Markdown, TXT, JSON, and reports to a local folder.</p>
        </div>
      </header>

      <section className="panel input-panel">
        <label htmlFor="url-input">Paste YouTube URLs - one per line</label>
        <textarea
          id="url-input"
          value={urls}
          disabled={running}
          placeholder={'https://www.youtube.com/watch?v=...\nhttps://youtu.be/...\nhttps://www.youtube.com/shorts/...'}
          onChange={(event) => {
            setUrls(event.target.value);
            if (!running) setJob(null);
          }}
        />

        <div className="settings-grid">
          <label>
            Language
            <select disabled={running} value={selectedLanguage} onChange={(event) => setSelectedLanguage(event.target.value)}>
              <option value="auto">Auto</option>
              <option value="en">English</option>
              <option value="vi">Vietnamese</option>
              <option value="custom">Available caption language code</option>
            </select>
          </label>
          {selectedLanguage === 'custom' && (
            <label>
              Language code
              <input disabled={running} value={customLanguage} placeholder="e.g. en-US, ja, fr" onChange={(event) => setCustomLanguage(event.target.value)} />
            </label>
          )}
          <div className="outputs" aria-label="Output formats">
            <span>Output</span>
            <label><input type="checkbox" checked disabled /> Markdown</label>
            <label><input type="checkbox" checked disabled /> TXT</label>
            <label><input type="checkbox" checked disabled /> JSON</label>
            <label><input type="checkbox" checked disabled /> CSV reports</label>
          </div>
        </div>

        <div className="actions">
          <button type="button" onClick={chooseFolder} disabled={running}>Choose Folder</button>
          <span className="folder-name">{parentFolder ? parentFolder.name : 'No folder selected'}</span>
          <button type="button" className="primary" onClick={start} disabled={running || !hasPending}>Start</button>
          <button type="button" onClick={stop} disabled={!running}>Stop</button>
          <button type="button" onClick={retryFailed} disabled={running || failedCount === 0}>Retry failed</button>
        </div>
        {message && <p className="message">{message}</p>}
      </section>

      <section className="panel">
        <div className="summary">
          <strong>Progress</strong>
          <span>{counts.total} total</span>
          <span>{counts.pending} pending</span>
          <span>{counts.processing} processing</span>
          <span>{counts.success} success</span>
          <span>{counts.failed} failed</span>
          <span>{counts.skipped} skipped</span>
          <span>{counts.cancelled} cancelled</span>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Order</th>
                <th>Title</th>
                <th>Channel</th>
                <th>Language</th>
                <th>Status</th>
                <th>Error</th>
              </tr>
            </thead>
            <tbody>
              {visibleJob.items.length === 0 ? (
                <tr><td colSpan={6} className="empty">Paste URLs to preview planned rows.</td></tr>
              ) : visibleJob.items.map((item) => (
                <tr key={`${item.order}-${item.inputUrl}`}>
                  <td>{item.order}</td>
                  <td>{item.title || item.videoId || item.inputUrl}</td>
                  <td>{item.channel || ''}</td>
                  <td>{item.language || ''}</td>
                  <td><span className={`status status-${item.status}`}>{item.status}</span></td>
                  <td>{item.error || ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
