import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import AppLayout from "@/components/AppLayout";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import Processos from "./pages/Processos";
import Tarefas from "./pages/Tarefas";
import Financeiro from "./pages/Financeiro";
import Clientes from "./pages/Clientes";
import PlaceholderPage from "@/components/PlaceholderPage";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="h-8 w-8 rounded-lg bg-primary animate-pulse" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  return <>{children}</>;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/auth" element={<Auth />} />

            {/* Protected app routes */}
            <Route
              element={
                <ProtectedRoute>
                  <AppLayout />
                </ProtectedRoute>
              }
            >
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/processos" element={<Processos />} />
              <Route path="/tarefas" element={<Tarefas />} />
              <Route path="/financeiro" element={<Financeiro />} />
              <Route path="/clientes" element={<Clientes />} />
              <Route path="/agenda" element={<PlaceholderPage title="Agenda" description="Gerencie compromissos, audiências e prazos processuais do seu escritório." />} />
              <Route path="/documentos" element={<PlaceholderPage title="Documentos" description="Crie, edite e gerencie petições, contratos e documentos jurídicos." />} />
              <Route path="/relatorios" element={<PlaceholderPage title="Relatórios" description="Analise a produtividade e o desempenho do seu escritório com relatórios detalhados." />} />
              <Route path="/configuracoes" element={<PlaceholderPage title="Configurações" description="Gerencie usuários, permissões e configurações do sistema." />} />
            </Route>

            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
