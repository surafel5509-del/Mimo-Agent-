import { describe, expect, it } from 'vitest';
import { parseLangSearch } from '@/lib/tools/web-search';

describe('LangSearch response parsing', () => {
  it('reads the webPages.value shape', () => {
    const out = parseLangSearch({ data: { webPages: { value: [{ name: 'A', url: 'https://a.example', snippet: '<b>x</b> y' }] } } }, 5);
    expect(out).toEqual([{ title: 'A', url: 'https://a.example', snippet: 'x y' }]);
  });

  it('drops non-http URLs and untitled results, and respects the count', () => {
    const out = parseLangSearch(
      { results: [{ name: 'bad', url: 'javascript:alert(1)' }, { name: '', url: 'https://nope.example' }, { title: 'ok', url: 'https://ok.example' }, { title: 'two', url: 'https://two.example' }] },
      1,
    );
    expect(out).toHaveLength(1);
    expect(out[0].url).toBe('https://ok.example');
  });

  it('returns an empty list for unknown shapes', () => {
    expect(parseLangSearch({ unexpected: true }, 5)).toEqual([]);
    expect(parseLangSearch(null, 5)).toEqual([]);
  });
});
