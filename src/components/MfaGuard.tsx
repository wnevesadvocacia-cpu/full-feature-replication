// Sec-3.1 — Hard block para admins APÓS expiração do grace period.
// Pré-deploy: todos os admins recebem grace de 7 dias via migration.
// Quando grace expira E o usuário ainda não tem MFA enrolled → redirect /configuracoes?tab=seguranca
import { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useIsAdmin } from '@/hooks/useUserRole';
import { supabase } from '@/integrations/supabase/client';

export function MfaGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const isAdmin = useIsAdmin();
  const location = useLocation();
  const [factorsLoaded, setFactorsLoaded] = useState(false);
  const [hasMfa, setHasMfa] = useState(false);

  useEffect(() => {
    if (!user) { setFactorsLoaded(true); return; }
    let cancel = false;
    (async () => {
      try {
        const { data } = await supabase.auth.mfa.listFactors();
        const verified = (data?.totp ?? []).some((f: any) => f.status === 'verified');
        if (!cancel) { setHasMfa(verified); setFactorsLoaded(true); }
      } catch {
        if (!cancel) setFactorsLoaded(true);
      }
    })();
    return () => { cancel = true; };
  }, [user]);

  if (loading || !factorsLoaded) return <>{children}</>;
  if (!user || !isAdmin || hasMfa) return <>{children}</>;

  // Admin sem MFA — checa grace
  const meta = (user.user_metadata ?? {}) as Record<string, any>;
  const graceISO = meta.mfa_grace_until as string | undefined;
  const graceUntil = graceISO ? new Date(graceISO).getTime() : 0;
  const expired = !graceISO || Date.now() > graceUntil;

  if (expired && location.pathname !== '/configuracoes') {
    return <Navigate to="/configuracoes?tab=seguranca&mfa=required" replace />;
  }
  return <>{children}</>;
}
