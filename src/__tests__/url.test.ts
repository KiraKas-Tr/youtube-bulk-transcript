import { describe, expect, it } from 'vitest';
import { parseYouTubeUrl } from '../utils/url';

describe('parseYouTubeUrl', () => {
  it('extracts watch URLs and ignores query noise', () => {
    expect(parseYouTubeUrl(' https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s ')).toEqual({
      ok: true,
      videoId: 'dQw4w9WgXcQ',
      canonicalUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    });
  });

  it('extracts youtu.be URLs', () => {
    expect(parseYouTubeUrl('https://youtu.be/dQw4w9WgXcQ?si=abc').ok).toBe(true);
  });

  it('extracts Shorts URLs', () => {
    expect(parseYouTubeUrl('https://www.youtube.com/shorts/dQw4w9WgXcQ?feature=share').ok).toBe(true);
  });

  it('rejects invalid or unsupported URLs', () => {
    expect(parseYouTubeUrl('not a url')).toEqual({ ok: false, error: 'INVALID_URL' });
    expect(parseYouTubeUrl('https://www.youtube.com/playlist?list=PLabc')).toEqual({ ok: false, error: 'INVALID_URL' });
    expect(parseYouTubeUrl('https://example.com/watch?v=dQw4w9WgXcQ')).toEqual({ ok: false, error: 'INVALID_URL' });
  });
});
