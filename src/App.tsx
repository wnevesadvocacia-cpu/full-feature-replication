import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { installGlobalHandlers } from "@/lib/sentryStub";

// SprintClosure Item 4 (stub): instala handlers globais para erros não-tratados.
installGlobalHandlers();

// Normalize malformed hash routes and redirect auth token hashes to the correct HashRouter route
if (typeof window !== 'undefined') {
  const _h = window.location.hash;
  const knownRoutes = ['/auth', '/reset-password', '/dashboard'];

  for (const route of knownRoutes) {
    if (_h.startsWith(`#${route}%20`) || _h.startsWith(`#${route} `) || _h.startsWith(`#${route}\n`) || _h.startsWith(`#${route}\t`)) {
      window.location.replace(`${window.location.pathname}${window.location.search}#${route}`);
      break;
    }
  }

  if (_h && !_h.startsWith('#/') && _h.includes('access_token=')) {
    const params = new URLSearchParams(_h.substring(1));
    const targetRoute = params.get('type') === 'recovery' ? '/reset-password' : '/dashboard';
    window.location.replace(`${window.location.pathname}?${_h.substring(1)}#${targetRoute}`);
  }
}

import { HashRouter } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import AppRoutes from "./routes";

// Sprint1.7: refetchOnWindowFocus global + auto-refresh.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
    },
  },
});

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <HashRouter>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </HashRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
