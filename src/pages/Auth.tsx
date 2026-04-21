import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Scale, ArrowRight, Mail, Lock, KeyRound, Shield, Clock } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

const SITE_URL = 'https://wnevesadvocacia-cpu.github.io/full-feature-replication';

export default function Auth() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [otpStep, setOtpStep] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [otpEmail, setOtpEmail] = useState('');
  const [countdown, setCountdown] = useState(300);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    if (otpStep) {
      setCountdown(300);
      countdownRef.current = setInterval(() => {
        setCountdown(prev => {
          if (prev <= 1) {
            clearInterval(countdownRef.current!);
            setOtpStep(false);
            setOtpCode('');
            toast({
              title: 'Código expirado',
              description: 'Faça login novamente para receber um novo código.',
              variant: 'destructive',
            });
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, [otpStep]);

  const formatCountdown = (seconds: number) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (isLogin) {
        const { error: pwError } = await supabase.auth.signInWithPassword({ email, password });
        if (pwError) throw pwError;

        await supabase.auth.signOut();

        const { error: otpError } = await supabase.auth.signInWithOtp({
          email,
          options: {
            shouldCreateUser: false,
            emailRedirectTo: `${SITE_URL}/#/dashboard`,
          },
        });
        if (otpError) throw otpError;

        setOtpEmail(email);
        setOtpStep(true);
        toast({
          title: 'Código enviado!',
          description: `Um código de 6 dígitos foi enviado para ${email}`,
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

  const handleOtpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (otpCode.length !== 6) {
      toast({ title: 'Código inválido', description: 'Digite o código de 6 dígitos.', variant: 'destructive' });
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.verifyOtp({
        email: otpEmail,
        token: otpCode,
        type: 'email',
      });
      if (error) throw error;
      if (countdownRef.current) clearInterval(countdownRef.current);
      navigate('/');
    } catch (err: any) {
      toast({ title: 'Código inválido', description: err.message, variant: 'destructive' });
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
      toast({ title: 'Email enviado!', description: 'Verifique seu email para redefinir a senha.' });
      setResetOpen(false);
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  if (otpStep) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <div className="flex items-center justify-center mb-4">
              <div className="bg-blue-600 p-3 rounded-full">
                <Shield className="h-8 w-8 text-white" />
              </div>
            </div>
            <h1 className="text-2xl font-bold text-white mb-1">Verificação em 2 etapas</h1>
            <p className="text-slate-400 text-sm">
              Código enviado para <span className="text-blue-400 font-medium">{otpEmail}</span>
            </p>
            <p className="text-slate-500 text-xs mt-1">
              Digite o código de 6 dígitos recebido no email
            </p>
          </div>
          <div className="bg-slate-800/60 backdrop-blur-sm border border-slate-700 rounded-2xl p-8 shadow-2xl">
            <form onSubmit={handleOtpSubmit} className="space-y-5">
              <div className="space-y-2">
                <Label className="text-slate-300 text-sm font-medium">Código de verificação</Label>
                <div className="relative">
                  <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={6}
                    placeholder="000000"
                    value={otpCode}
                    onChange={e => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    className="pl-10 bg-slate-700/50 border-slate-600 text-white placeholder:text-slate-500 text-center text-2xl tracking-[0.5em] font-mono h-14 focus:border-blue-500"
                    autoFocus
                  />
                </div>
              </div>
              <div className="flex items-center justify-center gap-2 text-sm text-slate-400">
                <Clock className="h-4 w-4" />
                <span>
                  Expira em{' '}
                  <span className={`font-mono font-bold ${countdown < 60 ? 'text-red-400' : 'text-blue-400'}`}>
                    {formatCountdown(countdown)}
                  </span>
                </span>
              </div>
              <Button
                type="submit"
                disabled={loading || otpCode.length !== 6}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-lg transition-all duration-200 flex items-center justify-center gap-2"
              >
                {loading ? 'Verificando...' : 'Confirmar acesso'}
                {!loading && <ArrowRight className="h-4 w-4" />}
              </Button>
              <button
                type="button"
                onClick={() => { setOtpStep(false); setOtpCode(''); }}
                className="w-full text-slate-400 hover:text-slate-300 text-sm transition-colors"
              >
                Voltar ao login
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

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
            <button
              onClick={() => setIsLogin(true)}
              className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-all duration-200 ${
                isLogin ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-300'
              }`}
            >
              Entrar
            </button>
            <button
              onClick={() => setIsLogin(false)}
              className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-all duration-200 ${
                !isLogin ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-300'
              }`}
            >
              Criar conta
            </button>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label className="text-slate-300 text-sm font-medium">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  type="email"
                  placeholder="seu@email.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  className="pl-10 bg-slate-700/50 border-slate-600 text-white placeholder:text-slate-500 focus:border-blue-500"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-slate-300 text-sm font-medium">Senha</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  className="pl-10 bg-slate-700/50 border-slate-600 text-white placeholder:text-slate-500 focus:border-blue-500"
                />
              </div>
            </div>
            {isLogin && (
              <div className="text-right">
                <button
                  type="button"
                  onClick={() => setResetOpen(true)}
                  className="text-blue-400 hover:text-blue-300 text-sm transition-colors"
                >
                  Esqueceu a senha?
                </button>
              </div>
            )}
            <Button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-lg transition-all duration-200 flex items-center justify-center gap-2 mt-2"
            >
              {loading
                ? isLogin ? 'Verificando credenciais...' : 'Criando conta...'
                : isLogin ? 'Entrar' : 'Criar conta'}
              {!loading && <ArrowRight className="h-4 w-4" />}
            </Button>
            {isLogin && (
              <p className="text-center text-xs text-slate-500 mt-3">
                <Shield className="inline h-3 w-3 mr-1" />
                Login protegido com verificação em 2 etapas
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
              <Input
                type="email"
                placeholder="seu@email.com"
                value={resetEmail}
                onChange={e => setResetEmail(e.target.value)}
                className="pl-10 bg-slate-700 border-slate-600 text-white placeholder:text-slate-500"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResetOpen(false)} className="border-slate-600 text-slate-300 hover:bg-slate-700">
              Cancelar
            </Button>
            <Button onClick={handleReset} disabled={loading} className="bg-blue-600 hover:bg-blue-700">
              {loading ? 'Enviando...' : 'Enviar email'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
        }
