import { Outlet } from 'react-router-dom';
import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/AppSidebar';
import { CommandMenu } from '@/components/CommandMenu';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Search, LogOut } from 'lucide-react';
import { NotificationBell } from '@/components/NotificationBell';
import { ThemeToggle } from '@/components/ThemeToggle';

export default function AppLayout() {
  const { user, signOut } = useAuth();

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          {/* Header — glass, sticky, hairline border */}
          <header className="sticky top-0 z-30 h-14 flex items-center justify-between glass border-b border-hairline px-4 shrink-0">
            <div className="flex items-center gap-3">
              <SidebarTrigger className="hover:bg-accent rounded-md transition-colors" />
              <button
                onClick={() => {
                  const e = new KeyboardEvent('keydown', { key: 'k', metaKey: true });
                  document.dispatchEvent(e);
                }}
                className="hidden sm:flex items-center gap-2.5 text-sm text-muted-foreground bg-muted/60 hover:bg-muted px-3 py-1.5 rounded-md transition-all duration-200 hover:text-foreground border border-hairline"
              >
                <Search className="h-3.5 w-3.5" />
                <span>Buscar processos, clientes, peças…</span>
                <kbd className="ml-6 text-[10px] font-medium bg-background/80 text-muted-foreground px-1.5 py-0.5 rounded border border-hairline">⌘K</kbd>
              </button>
            </div>

            <div className="flex items-center gap-1">
              <ThemeToggle />
              <NotificationBell />

              <div className="flex items-center gap-3 ml-2 pl-3 border-l border-hairline">
                <div className="h-8 w-8 rounded-full bg-gradient-gold flex items-center justify-center shadow-gold">
                  <span className="text-primary-foreground text-xs font-semibold">
                    {user?.user_metadata?.full_name?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase() || 'U'}
                  </span>
                </div>
                <Button variant="ghost" size="icon" onClick={signOut} className="hover:bg-accent" aria-label="Sair">
                  <LogOut className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </header>

          {/* Main content */}
          <main className="flex-1 overflow-auto">
            <div className="animate-fade-up">
              <Outlet />
            </div>
          </main>
        </div>
      </div>
      <CommandMenu />
    </SidebarProvider>
  );
}
