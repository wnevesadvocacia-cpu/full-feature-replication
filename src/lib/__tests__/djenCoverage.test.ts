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
import { createTransportBreaker, isTransportBlock } from '../../../supabase/functions/_shared/djenCoverage';
describe('TJSP transport breaker', () => {
  const reset = 'error sending request: client error (Connect): Connection reset by peer (os error 104)';
  it('classifies TLS EOF and resets as transport blocks, not HTTP/parse errors', () => {
    expect(isTransportBlock('client error (Connect): tls handshake eof')).toBe(true);
    expect(isTransportBlock(reset)).toBe(true);
    expect(isTransportBlock('TJSP: resposta não reconhecida; conferência não concluída.')).toBe(false);
  });
  it('opens after 3 consecutive refusals and resets on success', () => {
    const b = createTransportBreaker(3);
    b.fail(reset); b.fail(reset); b.ok(); b.fail(reset); b.fail(reset);
    expect(b.open).toBe(false);
    b.fail(reset);
    expect(b.open).toBe(true);
  });
});

import { decideTjspGate, nextTjspState } from '../../../supabase/functions/_shared/djenCoverage';

describe('TJSP eSAJ cadence', () => {
  const now = Date.parse('2026-11-06T18:00:00Z'); // 15:00 São Paulo
  it('skips the default window for 3h after a complete check on the same São Paulo day', () => {
    const s = { tjsp_last_ok_at: '2026-11-06T16:00:00Z', tjsp_next_attempt_at: null, tjsp_block_streak: 0 };
    expect(decideTjspGate(s, now, false)).toMatchObject({ run: false, reason: 'fresh' });
    expect(decideTjspGate(s, now, true)).toEqual({ run: true });
    expect(decideTjspGate({ ...s, tjsp_last_ok_at: '2026-11-06T14:59:00Z' }, now, false)).toEqual({ run: true });
  });
  it('requires a new check on a new São Paulo day', () => {
    const s = { tjsp_last_ok_at: '2026-11-07T02:30:00Z', tjsp_next_attempt_at: null, tjsp_block_streak: 0 }; // 23:30 SP
    expect(decideTjspGate(s, Date.parse('2026-11-07T03:10:00Z'), false)).toEqual({ run: true });
  });
  it('backs off refusals 15min, 30min ... capped at 3h, and pauses even explicit windows', () => {
    const a = nextTjspState(null, now, 'blocked');
    expect(a).toEqual({ tjsp_block_streak: 1, tjsp_next_attempt_at: '2026-11-06T18:15:00.000Z' });
    expect(nextTjspState({ tjsp_last_ok_at: null, tjsp_next_attempt_at: null, tjsp_block_streak: 1 }, now, 'blocked').tjsp_next_attempt_at).toBe('2026-11-06T18:30:00.000Z');
    expect(nextTjspState({ tjsp_last_ok_at: null, tjsp_next_attempt_at: null, tjsp_block_streak: 9 }, now, 'blocked').tjsp_next_attempt_at).toBe('2026-11-06T21:00:00.000Z');
    expect(decideTjspGate({ tjsp_last_ok_at: null, ...a } as any, now + 60_000, true)).toMatchObject({ run: false, reason: 'cooldown' });
    expect(decideTjspGate({ tjsp_last_ok_at: null, ...a } as any, now + 16 * 60_000, false)).toEqual({ run: true });
  });
  it('a non-transport failure neither confirms coverage nor backs off', () => {
    expect(nextTjspState(null, now, 'failed')).toEqual({});
    expect(nextTjspState(null, now, 'ok')).toMatchObject({ tjsp_block_streak: 0, tjsp_next_attempt_at: null });
  });
});
