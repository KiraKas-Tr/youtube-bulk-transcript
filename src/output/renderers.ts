import type { Transcript } from '../types';
import { formatTranscriptTimestamp } from '../utils/format';

function transcriptLines(transcript: Transcript): string[] {
  return transcript.segments.map((segment) => `[${formatTranscriptTimestamp(segment.start)}] ${segment.text}`);
}

export function renderTxt(transcript: Transcript): string {
  return [...transcriptLines(transcript), ''].join('\n');
}
