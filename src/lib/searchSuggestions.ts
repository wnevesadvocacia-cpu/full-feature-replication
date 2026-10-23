// Busca compartilhada de processos, clientes e documentos.
// Fonte única de verdade: usada pelo autocomplete das telas (SearchAutocomplete)
// e pela busca global do topo (⌘K), para que as duas retornem os mesmos resultados.
import { supabase } from '@/integrations/supabase/client';

export type SuggestionKind = 'client' | 'process' | 'document';

export interface Suggestion {
  kind: SuggestionKind;
  id: string;
  primary: string;        // texto principal (nome do cliente ou número do processo)
  secondary?: string;     // texto auxiliar (CPF, título, etc.)
  /** valor que será aplicado como termo de busca quando selecionado */
  searchValue: string;
}

const onlyDigits = (s: string) => s.replace(/\D/g, '');
const normalizeTerm = (s: string) => s.trim().replace(/[oO]/g, '0').replace(/[iIlL]/g, '1').replace(/[,;%]/g, ' ');

/** Página onde o resultado abre, já com o termo aplicado na busca daquela tela. */
export function suggestionRoute(s: Suggestion): string {
  const q = encodeURIComponent(s.searchValue);
  if (s.kind === 'client') return `/clientes?q=${q}`;
  if (s.kind === 'document') return `/documentos?q=${q}`;
  return `/processos?q=${q}`;
}

/**
 * Busca incremental (autocomplete) de clientes, processos e documentos.
 * - Cobre toda a base (server-side via Supabase, sem depender do limite de 1000).
 * - Aceita pesquisa por nome, e-mail, CPF/CNPJ, número do processo, título.
 */
export async function searchSuggestions(
  rawTerm: string,
  sources: SuggestionKind[] = ['client', 'process'],
): Promise<Suggestion[]> {
  const term = rawTerm.trim();
  if (term.length < 2) return [];
  const digits = onlyDigits(term);
  const promises: Promise<Suggestion[]>[] = [];

  if (sources.includes('client')) {
    promises.push(
      (async () => {
        const orParts = [`name.ilike.%${term}%`, `email.ilike.%${term}%`];
        if (digits.length >= 3) orParts.push(`document.ilike.%${digits}%`);
        const { data } = await supabase
          .from('clients')
          .select('id, name, document, email, type')
          .or(orParts.join(','))
          .order('name')
          .limit(8);
        return (data ?? []).map<Suggestion>((c: any) => ({
          kind: 'client',
          id: c.id,
          primary: c.name,
          secondary: c.document || c.email || c.type || undefined,
          searchValue: c.name,
        }));
      })(),
    );
  }

  if (sources.includes('process')) {
    promises.push(
      (async () => {
        const { data: rpcData, error: rpcError } = await supabase.rpc('search_process_options', {
          _term: normalizeTerm(term),
          _limit: 8,
        });
        if (!rpcError && rpcData) {
          return rpcData.map((p: any): Suggestion => ({
            kind: 'process',
            id: p.id,
            primary: p.number || p.title || '(sem número)',
            secondary: [p.title, p.client_name].filter(Boolean).join(' • '),
            searchValue: p.number || p.title || '',
          }));
        }

        // 1) Match direto em number/title/client_name/opponent
        const orParts = [
          `number.ilike.%${term}%`,
          `title.ilike.%${term}%`,
          `client_name.ilike.%${term}%`,
          `opponent.ilike.%${term}%`,
        ];
        const { data: direct } = await supabase
          .from('processes')
          .select('id, number, title, client_name')
          .or(orParts.join(','))
          .order('updated_at', { ascending: false })
          .limit(8);

        // 2) Match indireto via clients (nome/CPF) → processos vinculados
        let viaClients: any[] = [];
        const cliOr = [`name.ilike.%${term}%`];
        if (digits.length >= 3) cliOr.push(`document.ilike.%${digits}%`);
        const { data: cli } = await supabase
          .from('clients')
          .select('id')
          .or(cliOr.join(','))
          .limit(50);
        const clientIds = (cli ?? []).map((c: any) => c.id);
        if (clientIds.length) {
          const { data } = await supabase
            .from('processes')
            .select('id, number, title, client_name')
            .in('client_id', clientIds)
            .order('updated_at', { ascending: false })
            .limit(8);
          viaClients = data ?? [];
        }

        const seen = new Set<string>();
        const merged = [...(direct ?? []), ...viaClients].filter((p: any) => {
          if (seen.has(p.id)) return false;
          seen.add(p.id);
          return true;
        }).slice(0, 8);

        return merged.map<Suggestion>((p: any) => ({
          kind: 'process',
          id: p.id,
          primary: p.number || p.title || '(sem número)',
          secondary: [p.title, p.client_name].filter(Boolean).join(' • '),
          searchValue: p.number || p.title || '',
        }));
      })(),
    );
  }

  if (sources.includes('document')) {
    promises.push(
      (async () => {
        const { data } = await supabase
          .from('documents')
          .select('id, name, description, category')
          .or(`name.ilike.%${term}%,description.ilike.%${term}%`)
          .order('name')
          .limit(6);
        return (data ?? []).map<Suggestion>((d: any) => ({
          kind: 'document',
          id: d.id,
          primary: d.name,
          secondary: d.category || undefined,
          searchValue: d.name,
        }));
      })(),
    );
  }

  const results = await Promise.all(promises);
  return results.flat();
}
