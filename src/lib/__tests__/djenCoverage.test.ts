import { describe, expect, it } from 'vitest';
import { assertTribunalHtml, readDjenPage } from '../../../supabase/functions/_shared/djenCoverage';

describe('Publication coverage', () => {
  it('rejects successful HTTP responses without a publication list', () => {
    expect(() => readDjenPage({ error: 'blocked' }, 1, 20)).toThrow();
  });
  it('rejects an upstream failure even with an empty list', () => {
    expect(() => readDjenPage({ status: 'error', items: [] }, 1, 20)).toThrow();
  });
  it('marks remaining publications at the page limit as truncated', () => {
    expect(readDjenPage({ items: Array(100).fill({}), count: 2001 }, 20, 20).truncated).toBe(true);
  });
  it('does not truncate a completed last page', () => {
    expect(readDjenPage({ items: [{}], count: 101 }, 2, 20)).toMatchObject({ more: false, truncated: false });
  });
  it('rejects empty pages when the source reports remaining publications', () => {
    expect(() => readDjenPage({ items: [], count: 101 }, 1, 20)).toThrow();
  });
  it('accepts an explicit completed empty DJEN result', () => {
    expect(readDjenPage({ status: 'success', items: [], count: 0 }, 1, 20)).toEqual({ items: [], more: false, truncated: false });
  });
  it('never treats blocked tribunal HTML as an empty search', () => {
    expect(() => assertTribunalHtml('<html>Access denied</html>', 'TJSP')).toThrow();
  });
  it('rejects unrecognized tribunal pages', () => {
    expect(() => assertTribunalHtml('<html>Login</html>', 'TJSP')).toThrow();
  });
});