import { useState, useEffect, createContext, useContext } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { User, Session } from '@supabase/supabase-js';

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

type AuthContextType = {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshSession: () => Promise<Session | null>;
};

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  loading: true,
  signOut: async () => {},
  refreshSession: async () => null,
});

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  const applySession = (nextSession: Session | null) => {
    setSession(nextSession);
    setUser(nextSession?.user ?? null);
    setLoading(false);
  };

  const refreshSession = async () => {
    const { data, error } = await supabase.auth.getSession();
    const nextSession = error ? null : data.session ?? null;
    applySession(nextSession);
    return nextSession;
  };

  useEffect(() => {
    let mounted = true;

    const isPasswordRecoveryUrl = () => {
      const url = `${window.location.search}${window.location.hash}`;
      return window.location.hash.includes('/reset-password') && (url.includes('code=') || url.includes('type=recovery') || url.includes('access_token='));
    };

    const applyMountedSession = (nextSession: Session | null) => {
      if (!mounted) return;
      applySession(nextSession);
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, nextSession) => {
        if (event === 'PASSWORD_RECOVERY' || (event === 'SIGNED_IN' && nextSession?.user && isPasswordRecoveryUrl())) {
          sessionStorage.setItem('wb_password_recovery_pending', '1');
        }
        applyMountedSession(nextSession);
        if (event === 'PASSWORD_RECOVERY') window.location.hash = '/reset-password';
        // Sec-3.2/3.3 — log + register device em login bem-sucedido
        if (event === 'SIGNED_IN' && nextSession?.user) {
          // defer p/ não bloquear render
          setTimeout(async () => {
            try {
              await supabase.rpc('log_auth_event', { _event: 'login', _metadata: {} });
              const ua = navigator.userAgent || 'unknown';
              const uaHash = await sha256Hex(ua);
              const ipHash = await sha256Hex('client'); // IP real é capturado server-side em outros pontos
              await supabase.rpc('register_device', { _ua_hash: uaHash, _ip_hash: ipHash, _user_agent: ua.slice(0, 500) });
            } catch (err) { console.warn('[AuthProvider] post-login hooks failed', err); }
          }, 0);
        }
        if (event === 'SIGNED_OUT') {
          setTimeout(() => { supabase.rpc('log_auth_event', { _event: 'logout', _metadata: {} }).then(() => {}, () => {}); }, 0);
        }
      }
    );

    supabase.auth.getSession()
      .then(({ data, error }) => {
        if (error) {
          console.error('[AuthProvider] getSession error:', error);
          applyMountedSession(null);
          return;
        }
        applyMountedSession(data.session ?? null);
      })
      .catch((error) => {
        console.error('[AuthProvider] getSession unexpected error:', error);
        applyMountedSession(null);
      });

    const timer = setTimeout(() => {
      if (mounted) setLoading(false);
    }, 5000);

    return () => {
      mounted = false;
      subscription.unsubscribe();
      clearTimeout(timer);
    };
  }, []);

  const signOut = async () => {
    // S5+S18: revoga refresh token server-side em TODOS os devices.
    await supabase.auth.signOut({ scope: 'global' });
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, signOut, refreshSession }}>
      {children}
    </AuthContext.Provider>
  );
}
