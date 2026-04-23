import React from "react";
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
import Dashboard from "./pages/Dashboard";
import Processos from "./pages/Processos";
import Tarefas from "./pages/Tarefas";
import Financeiro from "./pages/Financeiro";
import Clientes from "./pages/Clientes";
import Agenda from "./pages/Agenda";
import Documentos from "./pages/Documentos";
import Relatorios from "./pages/Relatorios";
import Configuracoes from "./pages/Configuracoes";
import Movimentacoes from "./pages/Movimentacoes";
import CRM from "./pages/CRM";
import Modelos from "./pages/Modelos";
import Intimacoes from "./pages/Intimacoes";
import Notificacoes from "./pages/Notificacoes";
import NotFound from "./pages/NotFound";

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
          <h2 className="text-xl font-semibold text-gray-800">Erro ao carregar página</h2>
          <p className="text-sm text-gray-500 max-w-md">
            {this.state.error?.message ?? 'Erro desconhecido'}
          </p>
          <button
            className="mt-2 px-4 py-2 bg-primary text-white rounded-md text-sm"
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
            <Route
              element={
                <ProtectedRoute>
                  <AppLayout />
                </ProtectedRoute>
              }
            >
              <Route path="/dashboard"     element={<PageErrorBoundary><Dashboard /></PageErrorBoundary>} />
              <Route path="/processos"     element={<PageErrorBoundary><Processos /></PageErrorBoundary>} />
              <Route path="/tarefas"       element={<PageErrorBoundary><Tarefas /></PageErrorBoundary>} />
              <Route path="/financeiro"    element={<PageErrorBoundary><Financeiro /></PageErrorBoundary>} />
              <Route path="/clientes"      element={<PageErrorBoundary><Clientes /></PageErrorBoundary>} />
              <Route path="/agenda"        element={<PageErrorBoundary><Agenda /></PageErrorBoundary>} />
              <Route path="/documentos"    element={<PageErrorBoundary><Documentos /></PageErrorBoundary>} />
              <Route path="/relatorios"    element={<PageErrorBoundary><Relatorios /></PageErrorBoundary>} />
              <Route path="/configuracoes" element={<PageErrorBoundary><Configuracoes /></PageErrorBoundary>} />
              <Route path="/movimentacoes" element={<PageErrorBoundary><Movimentacoes /></PageErrorBoundary>} />
              <Route path="/crm"           element={<PageErrorBoundary><CRM /></PageErrorBoundary>} />
              <Route path="/modelos"       element={<PageErrorBoundary><Modelos /></PageErrorBoundary>} />
              <Route path="/intimacoes"    element={<PageErrorBoundary><Intimacoes /></PageErrorBoundary>} />
              <Route path="/notificacoes"  element={<PageErrorBoundary><Notificacoes /></PageErrorBoundary>} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </HashRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
