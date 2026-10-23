import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Command,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import {
  LayoutDashboard,
  Briefcase,
  CheckSquare,
  DollarSign,
  Users,
  Calendar,
  FileText,
  BarChart3,
  Settings,
  Activity,
  Loader2,
} from 'lucide-react';
import {
  searchSuggestions,
  suggestionRoute,
  type Suggestion,
} from '@/lib/searchSuggestions';

const commands = [
  { title: 'Dashboard', icon: LayoutDashboard, url: '/dashboard', group: 'Navegação' },
  { title: 'Processos', icon: Briefcase, url: '/processos', group: 'Navegação' },
  { title: 'Prazos', icon: CheckSquare, url: '/tarefas', group: 'Navegação' },
  { title: 'Financeiro', icon: DollarSign, url: '/financeiro', group: 'Navegação' },
  { title: 'Clientes', icon: Users, url: '/clientes', group: 'Navegação' },
  { title: 'Agenda', icon: Calendar, url: '/agenda', group: 'Navegação' },
  { title: 'Documentos', icon: FileText, url: '/documentos', group: 'Navegação' },
  { title: 'Movimentações', icon: Activity, url: '/movimentacoes', group: 'Navegação' },
  { title: 'Relatórios', icon: BarChart3, url: '/relatorios', group: 'Navegação' },
  { title: 'Configurações', icon: Settings, url: '/configuracoes', group: 'Navegação' },
];

const norm = (s: string) =>
  (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Busca global (⌘K): procura processos, clientes e documentos de verdade e abre a tela do resultado. */
export function CommandMenu() {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState('');
  const [items, setItems] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const debounceRef = useRef<number | null>(null);
  const reqIdRef = useRef(0);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, []);

  // Resultados reais: mesma busca usada nas telas (processos, clientes e documentos).
  useEffect(() => {
    const t = term.trim();
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    if (t.length < 2) {
      setItems([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const myReq = ++reqIdRef.current;
    debounceRef.current = window.setTimeout(async () => {
      try {
        const results = await searchSuggestions(t, ['process', 'client', 'document']);
        if (myReq !== reqIdRef.current) return; // resposta obsoleta
        setItems(results);
      } finally {
        if (myReq === reqIdRef.current) setLoading(false);
      }
    }, 200);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [term]);

  const go = (url: string) => {
    setOpen(false);
    setTerm('');
    navigate(url);
  };

  const openSuggestion = (s: Suggestion) => go(suggestionRoute(s));

  const q = norm(term.trim());
  const navMatches = commands.filter((c) => !q || norm(c.title).includes(q));
  const processos = items.filter((i) => i.kind === 'process');
  const clientes = items.filter((i) => i.kind === 'client');
  const documentos = items.filter((i) => i.kind === 'document');
  const searching = term.trim().length >= 2;
  const nothingFound = searching && !loading && items.length === 0;

  const renderItem = (s: Suggestion) => (
    <CommandItem
      key={`${s.kind}-${s.id}`}
      value={`${s.kind}-${s.id}`}
      onSelect={() => openSuggestion(s)}
      className="flex items-start gap-3 cursor-pointer"
    >
      <FileText className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="truncate">{s.primary}</div>
        {s.secondary && (
          <div className="text-xs text-muted-foreground truncate">{s.secondary}</div>
        )}
      </div>
    </CommandItem>
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="overflow-hidden p-0 shadow-lg">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Buscar processo, cliente ou documento..."
            value={term}
            onValueChange={setTerm}
          />
          <CommandList>
            {loading && (
              <div className="flex items-center gap-2 px-3 py-6 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Buscando…
              </div>
            )}
            {nothingFound && (
              <div className="px-3 py-6 text-sm text-muted-foreground">
                Nenhum processo, cliente ou documento encontrado.
              </div>
            )}

            {processos.length > 0 && (
              <CommandGroup heading="Processos">{processos.map(renderItem)}</CommandGroup>
            )}
            {clientes.length > 0 && (
              <CommandGroup heading="Clientes">{clientes.map(renderItem)}</CommandGroup>
            )}
            {documentos.length > 0 && (
              <CommandGroup heading="Documentos">{documentos.map(renderItem)}</CommandGroup>
            )}

            {navMatches.length > 0 && (
              <CommandGroup heading="Navegação">
                {navMatches.map((cmd) => (
                  <CommandItem
                    key={cmd.url}
                    value={`nav-${cmd.url}`}
                    onSelect={() => go(cmd.url)}
                    className="flex items-center gap-3 cursor-pointer"
                  >
                    <cmd.icon className="h-4 w-4 text-muted-foreground" />
                    <span>{cmd.title}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
