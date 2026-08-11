import { useLocation } from 'react-router-dom';
import { NavLink } from '@/components/NavLink';
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
  KanbanSquare,
  FileSignature,
  Bell,
  UserCog,
  Sparkles,
  Clock,
  Receipt,
  Wallet,
  TrendingUp,
  Link2,
  PenTool,
  Database,
  History,
  Settings2,
  ShieldCheck,
  Send,
} from 'lucide-react';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
  useSidebar,
} from '@/components/ui/sidebar';

const mainNav = [
  { title: 'Dashboard', url: '/dashboard', icon: LayoutDashboard },
  { title: 'CRM Kanban', url: '/crm', icon: KanbanSquare },
  { title: 'Processos', url: '/processos', icon: Briefcase },
  { title: 'Intimações', url: '/intimacoes', icon: Bell },
  { title: 'Agenda', url: '/agenda', icon: Calendar },
  { title: 'Tarefas', url: '/tarefas', icon: CheckSquare },
  { title: 'Timesheet', url: '/timesheet', icon: Clock },
  { title: 'Financeiro', url: '/financeiro', icon: DollarSign },
  { title: 'Honorários', url: '/honorarios', icon: Receipt },
  { title: 'Despesas', url: '/despesas', icon: Wallet },
  { title: 'Fluxo de Caixa', url: '/fluxo-caixa', icon: TrendingUp },
  { title: 'Clientes', url: '/clientes', icon: Users },
];

const secondaryNav: { title: string; url: string; icon: any; disabled?: boolean }[] = [
  { title: 'Gerador de Peças (IA)', url: '/gerador-pecas', icon: Sparkles },
  { title: 'Peticionamento Eletrônico (em breve)', url: '#peticionamento', icon: Send, disabled: true },
  { title: 'Modelos', url: '/modelos', icon: FileSignature },
  { title: 'Documentos', url: '/documentos', icon: FileText },
  { title: 'Movimentações', url: '/movimentacoes', icon: Activity },
  { title: 'Relatórios', url: '/relatorios', icon: BarChart3 },
  { title: 'Equipe', url: '/equipe', icon: UserCog },
  { title: 'Portal do Cliente', url: '/portal-acessos', icon: Link2 },
  { title: 'Assinatura Digital', url: '/assinaturas', icon: PenTool },
  { title: 'Versões de Petições', url: '/versoes', icon: History },
  { title: 'Personalizar Kanban', url: '/kanban-config', icon: Settings2 },
  { title: 'Importar Informações', url: '/importar', icon: Database },
  { title: 'Auditoria', url: '/auditoria', icon: ShieldCheck },
  { title: 'Auditoria de Tarefas', url: '/auditoria-tarefas', icon: ShieldCheck },

];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === 'collapsed';
  const location = useLocation();

  const isActive = (path: string) => location.pathname === path;

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border shadow-[4px_0_24px_hsl(var(--sidebar-background)/0.12)]">
      <SidebarHeader className="p-4 border-b border-sidebar-border min-h-16 justify-center">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-md bg-sidebar-primary flex items-center justify-center shrink-0 shadow-gold ring-1 ring-sidebar-primary/40">
            <span className="font-display text-xl font-bold text-primary-foreground leading-none">W</span>
          </div>
          {!collapsed && (
            <div className="flex flex-col leading-tight">
              <span className="font-display text-lg font-semibold text-sidebar-accent-foreground">
                WnevesBox
              </span>
               <span className="text-[10px] uppercase text-sidebar-muted font-semibold mt-0.5">
                 Gestão jurídica
              </span>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent className="px-2 py-2 scroll-fluid">
        <SidebarGroup>
          <SidebarGroupLabel className="text-sidebar-muted text-[10px] font-bold uppercase px-3">
            {!collapsed ? 'Módulos' : ''}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainNav.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    isActive={isActive(item.url)}
                    tooltip={item.title}
                  >
                    <NavLink
                      to={item.url}
                      end
                      className="flex items-center gap-3 px-3 py-2 rounded-md text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-all duration-200"
                      activeClassName="bg-sidebar-accent text-sidebar-primary font-semibold shadow-[inset_3px_0_0_hsl(var(--sidebar-primary))]"
                    >
                      <item.icon className="h-4 w-4 shrink-0" />
                      {!collapsed && <span className="text-sm">{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel className="text-sidebar-muted text-[10px] font-bold uppercase px-3">
            {!collapsed ? 'Ferramentas' : ''}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {secondaryNav.map((item) => (
                <SidebarMenuItem key={item.title}>
                  {item.disabled ? (
                    <SidebarMenuButton
                      tooltip={item.title}
                      className="opacity-50 cursor-not-allowed hover:bg-transparent"
                      onClick={(e) => e.preventDefault()}
                    >
                      <item.icon className="h-4 w-4 shrink-0" />
                      {!collapsed && <span className="text-sm">{item.title}</span>}
                    </SidebarMenuButton>
                  ) : (
                    <SidebarMenuButton
                      asChild
                      isActive={isActive(item.url)}
                      tooltip={item.title}
                    >
                      <NavLink
                        to={item.url}
                        end
                        className="flex items-center gap-3 px-3 py-2 rounded-md text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-all duration-200"
                        activeClassName="bg-sidebar-accent text-sidebar-primary font-semibold shadow-[inset_3px_0_0_hsl(var(--sidebar-primary))]"
                      >
                        <item.icon className="h-4 w-4 shrink-0" />
                        {!collapsed && <span className="text-sm">{item.title}</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  )}
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-2 border-t border-sidebar-border">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild isActive={isActive('/configuracoes')} tooltip="Configurações">
              <NavLink
                to="/configuracoes"
                end
                className="flex items-center gap-3 px-3 py-2 rounded-md text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-all duration-200"
                activeClassName="bg-sidebar-accent text-sidebar-primary font-semibold shadow-[inset_3px_0_0_hsl(var(--sidebar-primary))]"
              >
                <Settings className="h-4 w-4 shrink-0" />
                {!collapsed && <span className="text-sm">Configurações</span>}
              </NavLink>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
