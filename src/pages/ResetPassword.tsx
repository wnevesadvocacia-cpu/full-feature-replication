import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { ArrowRight, Lock, KeyRound } from 'lucide-react';

function translateAuthError(message: string): string {
  if (!message) return 'Erro inesperado. Tente novamente.';
  const m = message.toLowerCase();
  if (m.includes('password should be at least')) return 'A senha deve ter no mínimo 6 caracteres.';
  if (m.includes('same password')) return 'A nova senha deve ser diferente da atual.';
  if (m.includes('invalid') && m.includes('token')) return 'Link inválido ou expirado. Solicite um novo.';
  if (m.includes('expired')) return 'Link expirado. Solicite uma nova recuperação.';
  return message;
}

export default function ResetPassword() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [hasRecoverySession, setHasRecoverySession] = useState(false);
  const [checking, setChecking] = useState(true);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    const hash = window.location.hash;
    console.log('[ResetPassword] hash detected:', hash);

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      console.log('[ResetPassword] auth event:', event, !!session);
      if (event === 'PASSWORD_RECOVERY' || (event === 'SIGNED_IN' && session)) {
        setHasRecoverySession(true);
        setChecking(false);
      }
    });

    const processHash = async () => {
      if (hash && hash.includes('access_token')) {
        const params = new URLSearchParams(hash.replace(/^#/, ''));
        const accessToken = params.get('access_token');
        const refreshToken = params.get('refresh_token');
        const type = params.get('type');
        console.log('[ResetPassword] hash params:', { type, hasAccess: !!accessToken, hasRefresh: !!refreshToken });

        if (accessToken && refreshToken) {
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          console.log('[ResetPassword] setSession result:', error);
          if (!error) {
            setHasRecoverySession(true);
            window.history.replaceState(null, '', window.location.pathname);
            setChecking(false);
            return;
          }
        }
      }

      const { data: { session } } = await supabase.auth.getSession();
      console.log('[ResetPassword] fallback getSession:', !!session);
      if (session) setHasRecoverySession(true);
      setChecking(false);
    };

    processHash();

    // Safety net: nunca deixar o spinner eterno. Após 5s, libera a UI
    // mostrando "Link inválido" se a sessão de recovery não foi detectada.
    const timer = setTimeout(() => {
      setChecking((prev) => {
        if (prev) console.warn('[ResetPassword] timeout — liberando UI');
        return false;
      });
    }, 5000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timer);
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (password !== confirmPassword) {
      toast({ title: 'Erro', description: 'As senhas não coincidem.', variant: 'destructive' });
      return;
    }
    if (password.length < 6) {
      toast({ title: 'Erro', description: 'A senha deve ter no mínimo 6 caracteres.', variant: 'destructive' });
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      toast({ title: 'Senha redefinida!', description: 'Sua senha foi atualizada com sucesso.' });
      navigate('/dashboard');
    } catch (error: any) {
      toast({
        title: 'Erro',
        description: translateAuthError(error.message),
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      <div className="hidden lg:flex lg:w-1/2 bg-sidebar flex-col justify-between p-12">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary flex items-center justify-center">
            <span className="text-primary-foreground font-bold text-lg">W</span>
          </div>
          <span className="text-sidebar-accent-foreground font-display font-bold text-xl tracking-tight">
            WnevesBox
          </span>
        </div>

        <div className="space-y-6">
          <h1 className="text-4xl font-display font-bold text-sidebar-accent-foreground leading-tight">
            Redefina sua senha<br />com segurança.
          </h1>
          <p className="text-sidebar-foreground text-lg max-w-md">
            Escolha uma nova senha forte para proteger seu acesso ao sistema.
          </p>
        </div>

        <p className="text-sidebar-muted text-sm">
          © 2024 WnevesBox. Todos os direitos reservados.
        </p>
      </div>

      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-md space-y-8">
          <div className="lg:hidden flex items-center gap-3 justify-center mb-8">
            <div className="h-10 w-10 rounded-lg bg-primary flex items-center justify-center">
              <span className="text-primary-foreground font-bold text-lg">W</span>
            </div>
            <span className="font-display font-bold text-xl tracking-tight">WnevesBox</span>
          </div>

          <div className="space-y-2 text-center">
            <div className="flex justify-center mb-2">
              <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                <KeyRound className="h-6 w-6 text-primary" />
              </div>
            </div>
            <h2 className="text-2xl font-display font-bold">Redefinir senha</h2>
            <p className="text-muted-foreground">
              Digite sua nova senha abaixo.
            </p>
          </div>

          {checking ? (
            <div className="text-center text-muted-foreground">Verificando link...</div>
          ) : !hasRecoverySession ? (
            <div className="space-y-4 text-center">
              <p className="text-sm text-muted-foreground">
                Link inválido ou expirado. Solicite uma nova recuperação de senha.
              </p>
              <Button onClick={() => navigate('/auth')} className="w-full">
                Voltar ao login
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="password">Nova senha</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="password"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-10"
                    required
                    minLength={6}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirmar nova senha</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="confirmPassword"
                    type="password"
                    placeholder="••••••••"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="pl-10"
                    required
                    minLength={6}
                  />
                </div>
              </div>

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? 'Salvando...' : 'Redefinir senha'}
                {!loading && <ArrowRight className="h-4 w-4" />}
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
