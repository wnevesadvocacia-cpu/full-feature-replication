import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
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
} from 'lucide-react';

const commands = [
  { title: 'Dashboard', icon: LayoutDashboard, url: '/dashboard', group: 'Navegação' },
  { title: 'Processos', icon: Briefcase, url: '/processos', group: 'Navegação' },
  { title: 'Tarefas', icon: CheckSquare, url: '/tarefas', group: 'Navegação' },
  { title: 'Financeiro', icon: DollarSign, url: '/financeiro', group: 'Navegação' },
  { title: 'Clientes', icon: Users, url: '/clientes', group: 'Navegação' },
  { title: 'Agenda', icon: Calendar, url: '/agenda', group: 'Navegação' },
  { title: 'Documentos', icon: FileText, url: '/documentos', group: 'Navegação' },
  { title: 'Movimentações', icon: Activity, url: '/movimentacoes', group: 'Navegação' },
  { title: 'Relatórios', icon: BarChart3, url: '/relatorios', group: 'Navegação' },
  { title: 'Configurações', icon: Settings, url: '/configuracoes', group: 'Navegação' },
];

export function CommandMenu() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

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

  const handleSelect = (url: string) => {
    setOpen(false);
    navigate(url);
  };

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Buscar processo, cliente, tarefa..." />
      <CommandList>
        <CommandEmpty>Nenhum resultado encontrado.</CommandEmpty>
        <CommandGroup heading="Navegação">
          {commands.map((cmd) => (
            <CommandItem
              key={cmd.url}
              onSelect={() => handleSelect(cmd.url)}
              className="flex items-center gap-3 cursor-pointer"
            >
              <cmd.icon className="h-4 w-4 text-muted-foreground" />
              <span>{cmd.title}</span>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
