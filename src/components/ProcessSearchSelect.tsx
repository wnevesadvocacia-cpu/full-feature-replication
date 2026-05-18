import { useState, useMemo, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { SearchAutocomplete } from '@/components/SearchAutocomplete';

export interface ProcessOption {
  id: string;
  number: string;
  title: string;
  client_id?: string | null;
  client_name?: string | null;
  client_document?: string | null;
}

type ProcessRow = {
  id: string;
  number: string | null;
  title: string | null;
  client_id: string | null;
  clients?: { name: string | null; document: string | null } | null;
};

export function useProcessOptions() {
  return useQuery<ProcessOption[]>({
    queryKey: ['process-options-shared-v4-normalized'],
    queryFn: async () => {
      // O backend limita cada request a 1000 linhas; busca paginada e ordenação estável
      // garantem que processos após a primeira página também entrem na pesquisa.
      const pageSize = 1000;
      const all: ProcessRow[] = [];
      let from = 0;
      while (true) {
        const { data, error } = await supabase
          .from('processes')
          .select('id, number, title, client_id, clients(name, document)')
          .order('number', { ascending: true })
          .order('id', { ascending: true })
          .range(from, from + pageSize - 1);
        if (error) throw error;
        const batch = data ?? [];
        all.push(...batch);
        if (batch.length < pageSize) break;
        from += pageSize;
        if (from > 50000) break; // sanity guard
      }
      return all.map((p) => ({
        id: p.id,
        number: p.number ?? '',
        title: p.title ?? '',
        client_id: p.client_id,
        client_name: p.clients?.name ?? null,
        client_document: p.clients?.document ?? null,
      }));
    },
    staleTime: 5 * 60_000,
  });
}

interface Props {
  value: string;
  onChange: (id: string) => void;
  processes?: ProcessOption[];
  placeholder?: string;
  autoFocus?: boolean;
}

export function ProcessSearchSelect({ value, onChange, processes: external, placeholder, autoFocus }: Props) {
  const { data: fetched = [] } = useProcessOptions();
  const processes = external ?? fetched;

  const [query, setQuery] = useState('');

  const selected = useMemo(
    () => processes.find(p => p.id === value) || null,
    [processes, value]
  );

  useEffect(() => {
    if (selected) setQuery(`${selected.number} — ${selected.title}`);
    if (!value) setQuery('');
  }, [selected, value]);

  return (
    <div className="relative mt-1">
      <SearchAutocomplete
        autoFocus={autoFocus}
        value={query}
        onChange={(v) => { setQuery(v); if (value) onChange(''); }}
        onSelect={(s) => { if (s.kind === 'process') onChange(s.id); }}
        sources={['process']}
        placeholder={placeholder ?? 'Nº do processo, CPF/CNPJ ou nome do cliente…'}
      />
      {value && (
        <button
          type="button"
          onClick={() => { onChange(''); setQuery(''); }}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground hover:text-foreground"
          title="Limpar"
        >
          ✕
        </button>
      )}
    </div>
  );
}
