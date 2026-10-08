import { describe, expect, it } from 'vitest';
import { pendingDjenEntries } from '../../../supabase/functions/_shared/djenImport';
import { djenFailureSource } from '../djenHealth';

describe('DJEN processing and failure attribution', () => {
  it('skips already persisted publications but preserves every new identity', () => {
    expect(pendingDjenEntries([{ externalId: 'old' }, { externalId: 'new' }], ['old']))
      .toEqual([{ externalId: 'new' }]);
  });
  it('keeps all publications when none were previously imported', () => {
    expect(pendingDjenEntries([{ externalId: 'a' }, { externalId: 'b' }], [])).toHaveLength(2);
  });
  it('does not attribute a TJSP supplemental failure to DJEN', () => {
    expect(djenFailureSource('COBERTURA INCOMPLETA: TJSP: tls handshake eof')).toBe('Conferência complementar');
  });
  it('does not hide an incomplete DJEN query among supplemental failures', () => {
    expect(djenFailureSource('COBERTURA INCOMPLETA: Consulta DJEN interrompida | TJSP falhou')).toBe('Sincronização');
  });
});