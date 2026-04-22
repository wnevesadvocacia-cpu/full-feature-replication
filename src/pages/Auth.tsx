import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase, APP_URL } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import {
  Scale, Mail, Shield, Loader2, ArrowRight,
  Eye, EyeOff, RotateCcw, Lock, CheckCircle2, KeyRound,
} from 'lucide-react';

type Mode = 'login' | 'forgot' | 'sent';

export default function Auth() {
  const [mode, setMode]             = useState<Mode>('login');
  const [email, setEmail]           = useState('');
  const [password, setPassword]     = useState('');
  const [showPass, setShowPass]     = useState(false);
  const [loading, setLoading]       = useState(false);
  const [cooldown, setCooldown]     = useState(0);
  const navigate = useNavigate();
  const { toast } = useToast();

  // ── Já autenticado? ──────────────────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) navigate('/dashboard', { replace: true });
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session) navigate('/dashboard', { replace: true });
    });
    return () => subscription.unsubscribe();
  }, [navigate]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown(c => c - 1), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  // ── Login email + senha ──────────────────────────────────────────────────────
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      // onAuthStateChange cuida do redirect
    } catch (err: any) {
      const msg = err.message?.toLowerCase() ?? '';
      const friendly =
        msg.includes('invalid login') || msg.includes('invalid credentials')
          ? 'Email ou senha incorretos.'
          : msg.includes('email not confirmed')
          ? 'Email não confirmado. Verifique sua caixa de entrada.'
          : err.message;
      toast({ title: 'Erro ao entrar', description: friendly, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  // ── Enviar link de redefinição de senha ─────────────────────────────────────
  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: APP_URL,
      });
      if (error) throw error;
      setMode('sent');
      setCooldown(60);
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  // ── UI ───────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">

        {/* Logo */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center mb-4">
            <div className="bg-blue-600 p-3 rounded-full">
              <Scale className="h-8 w-8 text-white" />
            </div>
          </div>
          <h1 className="text-3xl font-bold text-white mb-1">WnevesBox</h1>
          <p className="text-blue-200 text-sm">Gestão Jurídica Inteligente</p>
        </div>

        <div className="bg-white rounded-2xl shadow-2xl p-8">

          {/* ── LOGIN ── */}
          {mode === 'login' && (
            <>
              <div className="mb-6 text-center">
                <div className="inline-flex items-center justify-center w-12 h-12 bg-blue-100 rounded-full mb-3">
                  <Lock className="h-6 w-6 text-blue-600" />
                </div>
                <h2 className="text-xl font-bold text-gray-900">Entrar</h2>
                <p className="text-sm text-gray-500 mt-1">Email e senha do escritório</p>
              </div>

              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <Label htmlFor="email">Email</Label>
                  <div className="relative mt-1">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input
                      id="email"
                      type="email"
                      placeholder="wnevesadvocacia@gmail.com"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      className="pl-9"
                      required
                      autoFocus
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password">Senha</Label>
                    <button
                      type="button"
                      onClick={() => setMode('forgot')}
                      className="text-xs text-blue-600 hover:underline"
                    >
                      Esqueci minha senha
                    </button>
                  </div>
                  <div className="relative mt-1">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input
                      id="password"
                      type={showPass ? 'text' : 'password'}
                      placeholder="••••••••"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      className="pl-9 pr-10"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPass(v => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <Button type="submit" className="w-full bg-blue-600 hover:bg-blue-700" disabled={loading}>
                  {loading
                    ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Entrando…</>
                    : <><ArrowRight className="h-4 w-4 mr-2" />Entrar</>}
                </Button>
              </form>

              <div className="mt-5 pt-4 border-t border-gray-100 flex items-center gap-2 text-xs text-gray-400">
                <Shield className="h-3.5 w-3.5 shrink-0" />
                <span>
                  Primeiro acesso? Clique em{' '}
                  <button onClick={() => setMode('forgot')} className="text-blue-500 hover:underline">
                    Esqueci minha senha
                  </button>{' '}
                  para definir sua senha via email.
                </span>
              </div>
            </>
          )}

          {/* ── ESQUECI A SENHA ── */}
          {mode === 'forgot' && (
            <>
              <div className="mb-6 text-center">
                <div className="inline-flex items-center justify-center w-12 h-12 bg-amber-100 rounded-full mb-3">
                  <KeyRound className="h-6 w-6 text-amber-600" />
                </div>
                <h2 className="text-xl font-bold text-gray-900">Redefinir senha</h2>
                <p className="text-sm text-gray-500 mt-1">
                  Enviaremos um link para criar ou redefinir sua senha.
                </p>
              </div>

              <form onSubmit={handleForgot} className="space-y-4">
                <div>
                  <Label htmlFor="email-forgot">Email</Label>
                  <div className="relative mt-1">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input
                      id="email-forgot"
                      type="email"
                      placeholder="wnevesadvocacia@gmail.com"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      className="pl-9"
                      required
                      autoFocus
                    />
                  </div>
                </div>
                <Button type="submit" className="w-full bg-amber-600 hover:bg-amber-700" disabled={loading}>
                  {loading
                    ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Enviando…</>
                    : <><Mail className="h-4 w-4 mr-2" />Enviar link de redefinição</>}
                </Button>
              </form>

              <button
                onClick={() => setMode('login')}
                className="mt-4 w-full text-center text-sm text-gray-400 hover:text-gray-600"
              >
                ← Voltar ao login
              </button>
            </>
          )}

          {/* ── EMAIL ENVIADO ── */}
          {mode === 'sent' && (
            <>
              <div className="mb-6 text-center">
                <div className="inline-flex items-center justify-center w-12 h-12 bg-green-100 rounded-full mb-3">
                  <CheckCircle2 className="h-6 w-6 text-green-600" />
                </div>
                <h2 className="text-xl font-bold text-gray-900">Email enviado!</h2>
                <p className="text-sm text-gray-500 mt-1">
                  Verifique a caixa de entrada de <strong>{email}</strong>
                </p>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm space-y-2 mb-5">
                <p className="font-semibold text-blue-800">Como definir a senha:</p>
                <ol className="list-decimal list-inside space-y-1 text-blue-700">
                  <li>Abra o email <strong>"Reset Your Password"</strong></li>
                  <li>Clique em <strong>"Reset Password"</strong></li>
                  <li>Digite e confirme sua nova senha</li>
                  <li>Pronto — você entrará automaticamente</li>
                </ol>
              </div>

              <div className="flex gap-3">
                <Button variant="outline" className="flex-1" onClick={() => setMode('login')}>
                  Voltar ao login
                </Button>
                <Button
                  variant="outline"
                  className="flex-1"
                  disabled={cooldown > 0 || loading}
                  onClick={async () => {
                    setLoading(true);
                    await supabase.auth.resetPasswordForEmail(email, { redirectTo: APP_URL });
                    setLoading(false);
                    setCooldown(60);
                    toast({ title: 'Email reenviado!' });
                  }}
                >
                  {cooldown > 0
                    ? <><RotateCcw className="h-4 w-4 mr-1" />{cooldown}s</>
                    : <><RotateCcw className="h-4 w-4 mr-1" />Reenviar</>}
                </Button>
              </div>
            </>
          )}
        </div>

        <p className="text-center text-blue-300 text-xs mt-6">
          WnevesBox &copy; {new Date().getFullYear()} — Todos os direitos reservados
        </p>
      </div>
    </div>
  );
}
