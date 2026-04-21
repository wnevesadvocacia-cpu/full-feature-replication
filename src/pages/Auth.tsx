import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Scale, ArrowRight, Mail, Lock, Shield, CheckCircle, Loader2 } from 'lucide-react';
import {
  Dialog, DialogContent, DialogDescription,
  DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';

const SITE_URL = 'https://wnevesadvocacia-cpu.github.io/full-feature-replication';

export default function Auth() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [linkSent, setLinkSent] = useState(false);
  const [linkEmail, setLinkEmail] = useState('');
  const navigate = useNavigate();
  const { toast } = useToast();

  // Listen for auth state — fires when user clicks magic link in email
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session) {
        navigate('/');
      }
    });
    return () => subscription.unsubscribe();
  }, [navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (isLogin) {
        // Step 1: verify password
        const { error: pwError } = await supabase.auth.signInWithPassword({ email, password });
        if (pwError) throw pwError;

        // Step 2: sign out temp session
        await supabase.auth.signOut();

        // Step 3: send magic link (2nd factor)
        const { error: linkError } = await supabase.auth.signInWithOtp({
          email,
          options: {
            shouldCreateUser: false,
            emailRedirectTo: `${SITE_URL}/#/`,
          },
        });
        if (linkError) throw linkError;

        setLinkEmail(email);
        setLinkSent(true);
        toast({
          title: 'Link enviado!',
          description: `Verifique ${email} e clique no link do email.`,
        });
      } else {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        toast({ title: 'Conta criada!', description: 'Verifique seu email para confirmar.' });
      }
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async () => {
    if (!resetEmail) return;
    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(resetEmail, {
        redirectTo: `${SITE_URL}/#/reset-password`,
      });
      if (error) throw error;
      toast({ title: 'Email enviado!', description: 'Verifique seu email.' });
      setResetOpen(false);
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  // "Check your email" screen
  if (linkSent) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <div className="flex items-center justify-center mb-4">
              <div className="bg-green-600 p-3 rounded-full">
                <CheckCircle className="h-8 w-8 text-white" />
              </div>
            </div>
            <h1 className="text-2xl font-bold text-white mb-2">Verifique seu email</h1>
            <p className="text-slate-400 text-sm">
              Um link de acesso seguro foi enviado para
            </p>
            <p className="text-blue-400 font-medium mt-1">{linkEmail}</p>
          </div>
          <div className="bg-slate-800/60 backdrop-blur-sm border border-slate-700 rounded-2xl p-8 shadow-2xl space-y-5">
            <div className="bg-blue-950/50 border border-blue-800 rounded-xl p-4 text-sm text-blue-200 space-y-2">
              <p className="font-semibold text-blue-300">📧 Como acessar:</p>
              <ol className="list-decimal list-inside space-y-1 text-slate-300">
                <li>Abra o email de <span className="text-blue-400">noreply@mail.app.supabase.io</span></li>
                <li>Clique no botão <span className="font-semibold">"Log In"</span></li>
                <li>Você será redirecionado automaticamente</li>
              </ol>
            </div>
            <div className="flex items-center justify-center gap-2 text-slate-500 text-xs">
              <Loader2 className="h-3 w-3 animate-spin" />
              <span>Aguardando confirmação...</span>
            </div>
            <button
              type="button"
              onClick={() => { setLinkSent(false); setLinkEmail(''); }}
              className="w-full text-slate-400 hover:text-slate-300 text-sm transition-colors text-center"
            >
              Voltar ao login
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Login / register screen
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center mb-4">
            <div className="bg-blue-600 p-3 rounded-full">
              <Scale className="h-8 w-8 text-white" />
            </div>
          </div>
          <h1 className="text-3xl font-bold text-white mb-1">WnevesBox</h1>
          <p className="text-slate-400 text-sm">Gestão Jurídica Inteligente</p>
        </div>
        <div className="bg-slate-800/60 backdrop-blur-sm border border-slate-700 rounded-2xl p-8 shadow-2xl">
          <div className="flex bg-slate-700/50 rounded-lg p-1 mb-6">
            <button onClick={() => setIsLogin(true)}
              className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-all duration-200 ${isLogin ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-300'}`}>
              Entrar
            </button>
            <button onClick={() => setIsLogin(false)}
              className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-all duration-200 ${!isLogin ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-300'}`}>
              Criar conta
            </button>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label className="text-slate-300 text-sm font-medium">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input type="email" placeholder="seu@email.com" value={email}
                  onChange={e => setEmail(e.target.value)} required
                  className="pl-10 bg-slate-700/50 border-slate-600 text-white placeholder:text-slate-500 focus:border-blue-500" />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-slate-300 text-sm font-medium">Senha</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input type="password" placeholder="••••••••" value={password}
                  onChange={e => setPassword(e.target.value)} required
                  className="pl-10 bg-slate-700/50 border-slate-600 text-white placeholder:text-slate-500 focus:border-blue-500" />
              </div>
            </div>
            {isLogin && (
              <div className="text-right">
                <button type="button" onClick={() => setResetOpen(true)}
                  className="text-blue-400 hover:text-blue-300 text-sm transition-colors">
                  Esqueceu a senha?
                </button>
              </div>
            )}
            <Button type="submit" disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-lg transition-all duration-200 flex items-center justify-center gap-2 mt-2">
              {loading
                ? <><Loader2 className="h-4 w-4 animate-spin" /> {isLogin ? 'Verificando...' : 'Criando...'}</>
                : <>{isLogin ? 'Entrar' : 'Criar conta'} <ArrowRight className="h-4 w-4" /></>}
            </Button>
            {isLogin && (
              <p className="text-center text-xs text-slate-500 mt-3">
                <Shield className="inline h-3 w-3 mr-1" />
                Login com verificação por email (2 etapas)
              </p>
            )}
          </form>
        </div>
      </div>

      <Dialog open={resetOpen} onOpenChange={setResetOpen}>
        <DialogContent className="bg-slate-800 border-slate-700 text-white">
          <DialogHeader>
            <DialogTitle>Redefinir senha</DialogTitle>
            <DialogDescription className="text-slate-400">
              Digite seu email para receber o link de redefinição.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Label className="text-slate-300 text-sm">Email</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input type="email" placeholder="seu@email.com" value={resetEmail}
                onChange={e => setResetEmail(e.target.value)}
                className="pl-10 bg-slate-700 border-slate-600 text-white placeholder:text-slate-500" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResetOpen(false)}
              className="border-slate-600 text-slate-300 hover:bg-slate-700">Cancelar</Button>
            <Button onClick={handleReset} disabled={loading} className="bg-blue-600 hover:bg-blue-700">
              {loading ? 'Enviando...' : 'Enviar email'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
    }
