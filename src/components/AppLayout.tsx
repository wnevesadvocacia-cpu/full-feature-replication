import { useRef } from 'react';
import { Outlet } from 'react-router-dom';
import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/AppSidebar';
import { CommandMenu } from '@/components/CommandMenu';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { LogOut, Search } from 'lucide-react';
import { NotificationBell } from '@/components/NotificationBell';
import { ThemeToggle } from '@/components/ThemeToggle';
import { useLegalCalendar } from '@/hooks/useLegalCalendar';
import { useRealtimeIntimacoes } from '@/hooks/useRealtimeIntimacoes';
import { FatScrollbar } from '@/components/FatScrollbar';

export default function AppLayout() {
  const { user, signOut } = useAuth();
  const mainRef = useRef<HTMLElement>(null);
  // Hidrata calendário legal global (suspensões + feriados de tribunal) e ativa Realtime
  useLegalCalendar();
  useRealtimeIntimacoes();

  return (
    <SidebarProvider>
      <div className="h-screen max-h-screen overflow-hidden flex w-full bg-background">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0 min-h-0">

          <header className="sticky top-0 z-30 h-16 flex items-center justify-between bg-card/95 backdrop-blur-xl border-b px-4 md:px-8 shrink-0 shadow-[0_1px_0_hsl(var(--border))]">
            <div className="flex items-center gap-3">
              <SidebarTrigger className="hover:bg-accent rounded-md transition-colors" />
              <button
                type="button"
                onClick={() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }))}
                className="hidden sm:flex h-9 w-72 lg:w-96 items-center gap-2 rounded-md border bg-muted/70 px-3 text-sm text-muted-foreground transition-colors hover:border-primary/40 hover:bg-muted"
                aria-label="Abrir busca global"
              >
                <Search className="h-4 w-4" />
                <span className="truncate">Pesquisar processos, clientes ou documentos...</span>
                <kbd className="ml-auto rounded border bg-card px-1.5 py-0.5 text-[10px] font-semibold">⌘K</kbd>
              </button>
            </div>

            <div className="flex items-center gap-1">
              <ThemeToggle />
              <NotificationBell />

              <div className="flex items-center gap-2.5 ml-2 pl-3 border-l border-hairline">
                <div className="h-8 w-8 rounded-full bg-primary flex items-center justify-center shadow-gold shrink-0 ring-2 ring-primary/15">
                  <span className="text-primary-foreground text-xs font-semibold">
                    {((user?.user_metadata as any)?.full_name?.[0] || user?.email?.[0] || 'U').toUpperCase()}
                  </span>
                </div>
                <div className="hidden md:flex flex-col leading-tight max-w-[180px]">
                  <span className="text-xs font-semibold text-foreground truncate">
                    {(user?.user_metadata as any)?.full_name || user?.email?.split('@')[0] || 'Usuário'}
                  </span>
                  {user?.email && (
                    <span className="text-[10px] text-muted-foreground truncate">{user.email}</span>
                  )}
                </div>
                <Button variant="ghost" size="icon" onClick={signOut} className="hover:bg-accent" aria-label="Sair">
                  <LogOut className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </header>

          {/* Main content */}
          <main ref={mainRef} className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden scroll-fluid no-native-scrollbar">
            <div className="animate-fade-up">
              <Outlet />
            </div>
          </main>
          <FatScrollbar targetRef={mainRef} />
        </div>
      </div>
      <CommandMenu />
    </SidebarProvider>
  );
}
