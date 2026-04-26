import { useEffect, useRef, useState } from 'react';
import { Search, User, FileText, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

export type SuggestionKind = 'client' | 'process';

export interface Suggestion {
  kind: SuggestionKind;
  id: string;
  primary: string;        // texto principal (nome do cliente ou número do processo)
  secondary?: string;     // texto auxiliar (CPF, título, etc.)
  /** valor que será aplicado como termo de busca quando selecionado */
  searchValue: string;
}

interface Props {
  value: string;
  onChange: (v: string) => void;
  /** chamado quando o usuário escolhe uma sugestão (clica ou Enter) */
  onSelect?: (s: Suggestion) => void;
  placeholder?: string;
  /** quais entidades sugerir */
  sources?: SuggestionKind[];
  className?: string;
  inputClassName?: string;
  autoFocus?: boolean;
}

const onlyDigits = (s: string) => s.replace(/\D/g, '');

/**
 * Busca incremental (autocomplete) de clientes e/ou processos.
 * - Cobre toda a base (server-side via Supabase, sem depender do limite de 1000).
 * - Aceita pesquisa por nome, e-mail, CPF/CNPJ, número do processo, título.
 * - Mostra dropdown com sugestões enquanto o usuário digita.
 */
export function SearchAutocomplete({
  value,
  onChange,
  onSelect,
  placeholder = 'Buscar…',
  sources = ['client', 'process'],
  className,
  inputClassName,
  autoFocus,
}: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<Suggestion[]>([]);
  const [highlight, setHighlight] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<number | null>(null);
  const reqIdRef = useRef(0);

  // fechar ao clicar fora
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  // busca debounced
  useEffect(() => {
    const term = value.trim();
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    if (term.length < 2) {
      setItems([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    debounceRef.current = window.setTimeout(async () => {
      const myReq = ++reqIdRef.current;
      try {
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
            })()
          );
        }

        if (sources.includes('process')) {
          promises.push(
            (async () => {
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
            })()
          );
        }

        const results = (await Promise.all(promises)).flat();
        if (myReq !== reqIdRef.current) return; // requisição obsoleta
        setItems(results);
        setHighlight(0);
        setOpen(true);
      } finally {
        if (myReq === reqIdRef.current) setLoading(false);
      }
    }, 220);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [value, sources.join(',')]);

  const choose = (s: Suggestion) => {
    onChange(s.searchValue);
    onSelect?.(s);
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open || items.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, items.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      choose(items[highlight]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
      <input
        type="text"
        value={value}
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => { if (items.length) setOpen(true); }}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        autoFocus={autoFocus}
        className={cn(
          'flex h-10 w-full rounded-md border border-input bg-background pl-10 pr-9 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
          inputClassName,
        )}
      />
      {loading && (
        <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground animate-spin" />
      )}

      {open && (items.length > 0 || (!loading && value.trim().length >= 2)) && (
        <div className="absolute z-50 mt-1 w-full min-w-[280px] rounded-md border bg-popover text-popover-foreground shadow-lg max-h-80 overflow-y-auto">
          {items.length === 0 ? (
            <div className="px-3 py-3 text-sm text-muted-foreground">Nenhum resultado.</div>
          ) : (
            <ul className="py-1">
              {items.map((s, i) => (
                <li
                  key={`${s.kind}-${s.id}`}
                  onMouseEnter={() => setHighlight(i)}
                  onMouseDown={(e) => { e.preventDefault(); choose(s); }}
                  className={cn(
                    'flex items-start gap-2 px-3 py-2 cursor-pointer text-sm',
                    i === highlight ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50',
                  )}
                >
                  {s.kind === 'client' ? (
                    <User className="h-4 w-4 mt-0.5 text-blue-600 shrink-0" />
                  ) : (
                    <FileText className="h-4 w-4 mt-0.5 text-purple-600 shrink-0" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="font-medium truncate">{s.primary}</div>
                    {s.secondary && (
                      <div className="text-xs text-muted-foreground truncate">{s.secondary}</div>
                    )}
                  </div>
                  <span className="text-[10px] uppercase tracking-wide text-muted-foreground shrink-0 mt-1">
                    {s.kind === 'client' ? 'Cliente' : 'Processo'}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
