import { useState, useMemo, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';

export interface ProcessOption {
  id: string;
  number: string;
  title: string;
  client_id?: string | null;
  client_name?: string | null;
  client_document?: string | null;
}

const onlyDigits = (s: string) => (s || '').replace(/\D+/g, '');

export function useProcessOptions() {
  return useQuery<ProcessOption[]>({
    queryKey: ['process-options-shared'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('processes')
        .select('id, number, title, client_id, clients(name, document)')
        .order('number', { ascending: true })
        .limit(4000);
      if (error) throw error;
      return (data ?? []).map((p: any) => ({
        id: p.id,
        number: p.number,
        title: p.title,
        client_id: p.client_id,
        client_name: p.clients?.name ?? null,
        client_document: p.clients?.document ?? null,
      }));
    },
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
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const selected = useMemo(
    () => processes.find(p => p.id === value) || null,
    [processes, value]
  );

  useEffect(() => {
    if (!open && selected) setQuery(`${selected.number} — ${selected.title}`);
    if (!open && !selected) setQuery('');
  }, [open, selected]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return processes.slice(0, 50);
    const qDigits = onlyDigits(q);
    return processes.filter(p => {
      const numDigits = onlyDigits(p.number);
      const docDigits = onlyDigits(p.client_document || '');
      if (qDigits && (numDigits.includes(qDigits) || (docDigits && docDigits.includes(qDigits)))) return true;
      const hay = `${p.number} ${p.title} ${p.client_name ?? ''}`.toLowerCase();
      return hay.includes(q);
    }).slice(0, 50);
  }, [processes, query]);

  return (
    <div ref={wrapRef} className="relative mt-1">
      <Input
        autoFocus={autoFocus}
        value={query}
        onFocus={() => { setOpen(true); if (selected) setQuery(''); }}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
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
      {open && (
        <div className="absolute z-50 mt-1 w-full max-h-64 overflow-y-auto rounded-md border bg-popover shadow-lg">
          <button
            type="button"
            className="w-full text-left px-3 py-2 text-xs text-muted-foreground hover:bg-muted"
            onMouseDown={(e) => { e.preventDefault(); onChange(''); setOpen(false); }}
          >
            — Nenhum processo —
          </button>
          {results.length === 0 ? (
            <div className="px-3 py-2 text-xs text-muted-foreground">Nenhum resultado.</div>
          ) : results.map(p => (
            <button
              key={p.id}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); onChange(p.id); setOpen(false); }}
              className={`block w-full text-left px-3 py-2 text-sm hover:bg-muted ${p.id === value ? 'bg-muted' : ''}`}
            >
              <div className="font-mono text-xs">{p.number}</div>
              <div className="truncate">{p.title}</div>
              {(p.client_name || p.client_document) && (
                <div className="text-[11px] text-muted-foreground truncate">
                  {p.client_name}{p.client_document ? ` · ${p.client_document}` : ''}
                </div>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
