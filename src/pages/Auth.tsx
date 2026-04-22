import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase, APP_URL } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import {
  Scale, Mail, Shield, Loader2, ArrowRight, Eye, EyeOff,
  RotateCcw, Lock, CheckCircle2, KeyRound, Link2,
} from 'lucide-react';

type Mode = 'login' | 'forgot' | 'sent' | 'paste';

export default function Auth() {
  const [mode, setMode]         = useState<Mode>('login');
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [pastedUrl, setPasted]  = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading]   = useState(false);
  const [cooldown, setCooldown] = useState(0);
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
    } catch (err: any) {
      const msg = err.message?.toLowerCase() ?? '';
      const friendly =
        msg.includes('invalid login') || msg.includes('invalid credentials')
          ? 'Email ou senha incorretos.'
          : msg.includes('email not confirmed')
          ? 'Email não confirmado. Verifique sua caixa de entrada.'
          : err.message;
      toast({ title: 'Erro ao entrar', description: friendly, variant: 'destructive' });
    } finally { setLoading(false); }
  };

  // ── Esqueci a senha ──────────────────────────────────────────────────────────
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
    } finally { setLoading(false); }
  };

  // ── Extrai sessão da URL copiada (Lovable auth-bridge ou token direto) ───────
  const handlePasteUrl = async () => {
    const raw = pastedUrl.trim();
    if (!raw) return;
    setLoading(true);
    try {
      let urlObj: URL;
      try { urlObj = new URL(raw); } catch { throw new Error('URL inválida. Cole a URL completa da barra de endereços.'); }

      // Tokens podem estar no hash da URL ou em return_url dentro da query string
      let hashStr = urlObj.hash.replace(/^#/, '');

      // Caso Lovable auth-bridge: extrai o return_url e pega o hash DELE
      const returnUrl = urlObj.searchParams.get('return_url');
      if (returnUrl && !hashStr.includes('access_token')) {
        try {
          const inner = new URL(returnUrl);
          hashStr = inner.hash.replace(/^#/, '');
        } catch { /* ignora */ }
      }

      const params = new URLSearchParams(hashStr);
      const access_token  = params.get('access_token');
      const refresh_token = params.get('refresh_token');
      const code          = urlObj.searchParams.get('code');

      if (access_token && refresh_token) {
        const { error } = await supabase.auth.setSession({ access_token, refresh_token });
        if (error) throw error;
        navigate('/dashboard', { replace: true });
        return;
      }
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) throw error;
        navigate('/dashboard', { replace: true });
        return;
      }

      throw new Error('Token não encontrado na URL. Copie a URL COMPLETA da barra de endereços (incluindo tudo após o #).');
    } catch (err: any) {
      toast({ title: 'Erro ao autenticar', description: err.message, variant: 'destructive' });
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">

        {/* Logo */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center mb-4">
            <div className="bg-blue-600 p-3 rounded-full"><Scale className="h-8 w-8 text-white" /></div>
          </div>
          <h1 className="text-3xl font-bold text-white mb-1">WnevesBox</h1>
          <p className="text-blue-200 text-sm">Gestão Jurídica Inteligente</p>
        </div>

        <div className="bg-white rounded-2xl shadow-2xl p-8">

          {/* ── LOGIN ── */}
          {mode === 'login' && (
            <>
              <div className="mb-5 text-center">
                <div className="inline-flex items-center justify-center w-12 h-12 bg-blue-100 rounded-full mb-3">
                  <Lock className="h-6 w-6 text-blue-600" />
                </div>
                <h2 className="text-xl font-bold text-gray-900">Entrar</h2>
              </div>

              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <Label htmlFor="email">Email</Label>
                  <div className="relative mt-1">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input id="email" type="email" placeholder="wnevesadvocacia@gmail.com"
                      value={email} onChange={e => setEmail(e.target.value)}
                      className="pl-9" required autoFocus />
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password">Senha</Label>
                    <button type="button" onClick={() => setMode('forgot')}
                      className="text-xs text-blue-600 hover:underline">
                      Esqueci minha senha
                    </button>
                  </div>
                  <div className="relative mt-1">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input id="password" type={showPass ? 'text' : 'password'} placeholder="••••••••"
                      value={password} onChange={e => setPassword(e.target.value)}
                      className="pl-9 pr-10" required />
                    <button type="button" onClick={() => setShowPass(v => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                      {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <Button type="submit" className="w-full bg-blue-600 hover:bg-blue-700" disabled={loading}>
                  {loading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Entrando…</>
                    : <><ArrowRight className="h-4 w-4 mr-2" />Entrar</>}
                </Button>
              </form>

              {/* Opção colar URL do email */}
              <div className="mt-4 pt-4 border-t border-gray-100">
                <button onClick={() => setMode('paste')}
                  className="w-full flex items-center justify-center gap-2 text-sm text-gray-500 hover:text-blue-600">
                  <Link2 className="h-4 w-4" />
                  Tenho um link do email (colar URL)
                </button>
              </div>
            </>
          )}

          {/* ── ESQUECI A SENHA ── */}
          {mode === 'forgot' && (
            <>
              <div className="mb-5 text-center">
                <div className="inline-flex items-center justify-center w-12 h-12 bg-amber-100 rounded-full mb-3">
                  <KeyRound className="h-6 w-6 text-amber-600" />
                </div>
                <h2 className="text-xl font-bold text-gray-900">Redefinir senha</h2>
                <p className="text-sm text-gray-500 mt-1">Enviaremos um link de redefinição de senha.</p>
              </div>
              <form onSubmit={handleForgot} className="space-y-4">
                <div>
                  <Label>Email</Label>
                  <div className="relative mt-1">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input type="email" placeholder="wnevesadvocacia@gmail.com"
                      value={email} onChange={e => setEmail(e.target.value)}
                      className="pl-9" required autoFocus />
                  </div>
                </div>
                <Button type="submit" className="w-full bg-amber-600 hover:bg-amber-700" disabled={loading}>
                  {loading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Enviando…</>
                    : <><Mail className="h-4 w-4 mr-2" />Enviar link de redefinição</>}
                </Button>
              </form>
              <button onClick={() => setMode('login')} className="mt-4 w-full text-center text-sm text-gray-400 hover:text-gray-600">
                ← Voltar ao login
              </button>
            </>
          )}

          {/* ── EMAIL ENVIADO ── */}
          {mode === 'sent' && (
            <>
              <div className="mb-5 text-center">
                <div className="inline-flex items-center justify-center w-12 h-12 bg-green-100 rounded-full mb-3">
                  <CheckCircle2 className="h-6 w-6 text-green-600" />
                </div>
                <h2 className="text-xl font-bold text-gray-900">Email enviado!</h2>
                <p className="text-sm text-gray-500 mt-1">Verifique a caixa de entrada de <strong>{email}</strong></p>
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm space-y-2 mb-5">
                <p className="font-semibold text-amber-800">⚠️ Atenção — o link redireciona para o Lovable:</p>
                <ol className="list-decimal list-inside space-y-1 text-amber-700">
                  <li>Clique em <strong>"Reset Password"</strong> no email</li>
                  <li>Aparecerá a página do Lovable</li>
                  <li><strong>Copie a URL completa</strong> da barra de endereços <span className="text-xs">(Ctrl+L → Ctrl+C)</span></li>
                  <li>Volte ao WnevesBox → clique em <strong>"Tenho um link do email"</strong></li>
                  <li>Cole a URL → entrará automaticamente</li>
                </ol>
              </div>
              <div className="flex gap-3">
                <Button variant="outline" className="flex-1" onClick={() => { setMode('paste'); }}>
                  <Link2 className="h-4 w-4 mr-2" /> Colar URL
                </Button>
                <Button variant="outline" className="flex-1" disabled={cooldown > 0 || loading}
                  onClick={async () => {
                    setLoading(true);
                    await supabase.auth.resetPasswordForEmail(email, { redirectTo: APP_URL });
                    setLoading(false); setCooldown(60);
                    toast({ title: 'Email reenviado!' });
                  }}>
                  {cooldown > 0 ? <><RotateCcw className="h-4 w-4 mr-1" />{cooldown}s</> : <><RotateCcw className="h-4 w-4 mr-1" />Reenviar</>}
                </Button>
              </div>
            </>
          )}

          {/* ── COLAR URL ── */}
          {mode === 'paste' && (
            <>
              <div className="mb-5 text-center">
                <div className="inline-flex items-center justify-center w-12 h-12 bg-purple-100 rounded-full mb-3">
                  <Link2 className="h-6 w-6 text-purple-600" />
                </div>
                <h2 className="text-xl font-bold text-gray-900">Cole a URL aqui</h2>
                <p className="text-sm text-gray-500 mt-1">
                  Cole a URL completa da barra de endereços após clicar no link do email
                </p>
              </div>
              <div className="mb-4">
                <Label>URL copiada do navegador</Label>
                <textarea
                  className="mt-1 w-full border-2 border-gray-300 rounded-lg p-3 text-xs font-mono focus:border-blue-500 focus:outline-none resize-none"
                  rows={5}
                  placeholder={"https://lovable.dev/auth-bridge?project_id=...#access_token=...\nou\nhttps://...github.io/...#access_token=..."}
                  value={pastedUrl}
                  onChange={e => setPasted(e.target.value)}
                  autoFocus
                />
              </div>
              <Button onClick={handlePasteUrl} className="w-full bg-purple-600 hover:bg-purple-700"
                disabled={loading || !pastedUrl.trim()}>
                {loading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Autenticando…</>
                  : <><CheckCircle2 className="h-4 w-4 mr-2" />Entrar com este link</>}
              </Button>
              <button onClick={() => setMode('login')} className="mt-3 w-full text-center text-sm text-gray-400 hover:text-gray-600">
                ← Voltar ao login
              </button>
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
