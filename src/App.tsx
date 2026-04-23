import React, { Suspense, lazy } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// Redirect Supabase implicit-flow recovery tokens to the correct HashRouter route
if (typeof window !== 'undefined') {
  const _h = window.location.hash;
  if (_h && !_h.startsWith('#/') && _h.includes('access_token=')) {
    window.location.replace(window.location.pathname + '?' + _h.substring(1) + '#/reset-password');
  }
}
import { HashRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import AppLayout from "@/components/AppLayout";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import ResetPassword from "./pages/ResetPassword";

// Lazy-loaded routes (code splitting)
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Processos = lazy(() => import("./pages/Processos"));
const Tarefas = lazy(() => import("./pages/Tarefas"));
const Financeiro = lazy(() => import("./pages/Financeiro"));
const Clientes = lazy(() => import("./pages/Clientes"));
const Agenda = lazy(() => import("./pages/Agenda"));
const Documentos = lazy(() => import("./pages/Documentos"));
const Relatorios = lazy(() => import("./pages/Relatorios"));
const Configuracoes = lazy(() => import("./pages/Configuracoes"));
const Movimentacoes = lazy(() => import("./pages/Movimentacoes"));
const CRM = lazy(() => import("./pages/CRM"));
const Modelos = lazy(() => import("./pages/Modelos"));
const Intimacoes = lazy(() => import("./pages/Intimacoes"));
const Notificacoes = lazy(() => import("./pages/Notificacoes"));
const Equipe = lazy(() => import("./pages/Equipe"));
const GeradorPecas = lazy(() => import("./pages/GeradorPecas"));
const Timesheet = lazy(() => import("./pages/Timesheet"));
const Honorarios = lazy(() => import("./pages/Honorarios"));
const Despesas = lazy(() => import("./pages/Despesas"));
const FluxoCaixa = lazy(() => import("./pages/FluxoCaixa"));
const PortalAcessos = lazy(() => import("./pages/PortalAcessos"));
const PortalCliente = lazy(() => import("./pages/PortalCliente"));
const Assinaturas = lazy(() => import("./pages/Assinaturas"));
const ImportarAdvbox = lazy(() => import("./pages/ImportarAdvbox"));
const Versoes = lazy(() => import("./pages/Versoes"));
const KanbanConfig = lazy(() => import("./pages/KanbanConfig"));
const NotFound = lazy(() => import("./pages/NotFound"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30_000 },
  },
});

// ── ErrorBoundary ─────────────────────────────────────────────────────────────
interface EBState { hasError: boolean; error?: Error }
class PageErrorBoundary extends React.Component<{ children: React.ReactNode }, EBState> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError(error: Error): EBState {
    return { hasError: true, error };
  }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[PageErrorBoundary]', error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 p-8 text-center">
          <div className="text-4xl">⚠️</div>
          <h2 className="text-xl font-semibold text-foreground">Erro ao carregar página</h2>
          <p className="text-sm text-muted-foreground max-w-md">
            {this.state.error?.message ?? 'Erro desconhecido'}
          </p>
          <button
            className="mt-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm"
            onClick={() => this.setState({ hasError: false, error: undefined })}
          >
            Tentar novamente
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ── Suspense fallback ─────────────────────────────────────────────────────────
const RouteFallback = () => (
  <div className="flex items-center justify-center min-h-[60vh]">
    <div className="h-8 w-8 rounded-full border-4 border-primary border-t-transparent animate-spin" />
  </div>
);

// ── ProtectedRoute ────────────────────────────────────────────────────────────
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 rounded-full border-4 border-primary border-t-transparent animate-spin" />
          <p className="text-sm text-muted-foreground">Carregando…</p>
        </div>
      </div>
    );
  }
  if (!user) return <Navigate to="/auth" replace />;
  return <>{children}</>;
}

const wrap = (El: React.ComponentType) => (
  <PageErrorBoundary>
    <Suspense fallback={<RouteFallback />}>
      <El />
    </Suspense>
  </PageErrorBoundary>
);

// ── App ───────────────────────────────────────────────────────────────────────
const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <HashRouter>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/portal/:token" element={wrap(PortalCliente)} />
            <Route
              element={
                <ProtectedRoute>
                  <AppLayout />
                </ProtectedRoute>
              }
            >
              <Route path="/dashboard"     element={wrap(Dashboard)} />
              <Route path="/processos"     element={wrap(Processos)} />
              <Route path="/tarefas"       element={wrap(Tarefas)} />
              <Route path="/financeiro"    element={wrap(Financeiro)} />
              <Route path="/clientes"      element={wrap(Clientes)} />
              <Route path="/agenda"        element={wrap(Agenda)} />
              <Route path="/documentos"    element={wrap(Documentos)} />
              <Route path="/relatorios"    element={wrap(Relatorios)} />
              <Route path="/configuracoes" element={wrap(Configuracoes)} />
              <Route path="/movimentacoes" element={wrap(Movimentacoes)} />
              <Route path="/crm"           element={wrap(CRM)} />
              <Route path="/modelos"       element={wrap(Modelos)} />
              <Route path="/intimacoes"    element={wrap(Intimacoes)} />
              <Route path="/notificacoes"  element={wrap(Notificacoes)} />
              <Route path="/equipe"        element={wrap(Equipe)} />
              <Route path="/gerador-pecas" element={wrap(GeradorPecas)} />
              <Route path="/timesheet"     element={wrap(Timesheet)} />
              <Route path="/honorarios"    element={wrap(Honorarios)} />
              <Route path="/despesas"      element={wrap(Despesas)} />
              <Route path="/fluxo-caixa"   element={wrap(FluxoCaixa)} />
              <Route path="/portal-acessos" element={wrap(PortalAcessos)} />
              <Route path="/assinaturas"   element={wrap(Assinaturas)} />
              <Route path="/importar"      element={wrap(ImportarAdvbox)} />
              <Route path="/versoes"       element={wrap(Versoes)} />
              <Route path="/kanban-config" element={wrap(KanbanConfig)} />
            </Route>
            <Route path="*" element={wrap(NotFound)} />
          </Routes>
        </AuthProvider>
      </HashRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
