import { describe, it, expect } from 'vitest';
import { suggestionRoute, type Suggestion } from '../searchSuggestions';

const base = (over: Partial<Suggestion>): Suggestion => ({
  kind: 'process',
  id: '1',
  primary: 'x',
  searchValue: 'x',
  ...over,
});

describe('suggestionRoute — para onde a busca global (⌘K) leva cada resultado', () => {
  it('processo abre a lista de processos já filtrada pelo número', () => {
    expect(
      suggestionRoute(base({ kind: 'process', searchValue: '0007455-41.2024.8.16.0038' })),
    ).toBe('/processos?q=0007455-41.2024.8.16.0038');
  });

  it('cliente abre a lista de clientes com o nome aplicado na busca', () => {
    expect(
      suggestionRoute(base({ kind: 'client', searchValue: 'ZENILDA APARECIDA PIRES DA CRUZ' })),
    ).toBe('/clientes?q=ZENILDA%20APARECIDA%20PIRES%20DA%20CRUZ');
  });

  it('documento abre a lista de documentos com o nome aplicado na busca', () => {
    expect(
      suggestionRoute(base({ kind: 'document', searchValue: 'petição inicial.pdf' })),
    ).toBe('/documentos?q=peti%C3%A7%C3%A3o%20inicial.pdf');
  });
});
