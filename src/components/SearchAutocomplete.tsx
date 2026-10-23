import { useEffect, useRef, useState } from 'react';
import { Search, User, FileText, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { searchSuggestions, type Suggestion, type SuggestionKind } from '@/lib/searchSuggestions';

export type { Suggestion, SuggestionKind } from '@/lib/searchSuggestions';

interface Props {
  value: string;
  onChange: (v: string) => void;
  /** chamado quando o usuário escolhe uma sugestão (clica ou Enter) */
  onSelect?: (s: Suggestion) => void;
  searchEnabled?: boolean;
  placeholder?: string;
  /** quais entidades sugerir */
  sources?: SuggestionKind[];
  className?: string;
  inputClassName?: string;
  autoFocus?: boolean;
}

/**
 * Busca incremental (autocomplete) de clientes e/ou processos.
 * - Cobre toda a base (server-side via Supabase, sem depender do limite de 1000).
 * - Aceita pesquisa por nome, e-mail, CPF/CNPJ, número do processo, título.
 * - Mostra dropdown com sugestões enquanto o usuário digita.
 * - A consulta em si mora em src/lib/searchSuggestions.ts, compartilhada com a busca global (⌘K).
 */
export function SearchAutocomplete({
  value,
  onChange,
  onSelect,
  searchEnabled = true,
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
    if (!searchEnabled || term.length < 2) {
      setItems([]);
      setLoading(false);
      setOpen(false);
      return;
    }
    setLoading(true);
    const myReq = ++reqIdRef.current;
    debounceRef.current = window.setTimeout(async () => {
      try {
        const results = await searchSuggestions(term, sources);
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
  }, [value, searchEnabled, sources.join(',')]);

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
        aria-autocomplete="list"
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
                    <User className="h-4 w-4 mt-0.5 text-primary shrink-0" />
                  ) : (
                    <FileText className="h-4 w-4 mt-0.5 text-primary shrink-0" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="font-medium truncate">{s.primary}</div>
                    {s.secondary && (
                      <div className="text-xs text-muted-foreground truncate">{s.secondary}</div>
                    )}
                  </div>
                  <span className="text-[10px] uppercase tracking-wide text-muted-foreground shrink-0 mt-1">
                    {s.kind === 'client' ? 'Cliente' : s.kind === 'document' ? 'Documento' : 'Processo'}
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
