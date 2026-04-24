import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import {
  Scale, Mail, Loader2, ArrowRight, RotateCcw, Lock, CheckCircle2, ShieldCheck,
} from 'lucide-react';

type Step = 'email' | 'otp';

export default function Auth() {
  const [step, setStep]       = useState<Step>('email');
  const [email, setEmail]     = useState('');
  const [otp, setOtp]         = useState('');
  const [loading, setLoading] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const navigate = useNavigate();
  const { toast } = useToast();

  const { user } = useAuth();
  useEffect(() => {
    if (user) navigate('/dashboard', { replace: true });
  }, [user, navigate]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown(c => c - 1), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  // Passo 1 — solicita o código por email
  const sendCode = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!email) return;
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { shouldCreateUser: true },
      });
      if (error) throw error;
      setStep('otp');
      setOtp('');
      setCooldown(60);
      toast({ title: 'Código enviado!', description: `Verifique a caixa de entrada de ${email}` });
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    } finally { setLoading(false); }
  };

  // Passo 2 — valida o código de 6 dígitos
  const verifyCode = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (otp.length !== 6) {
      toast({ title: 'Código inválido', description: 'Digite os 6 dígitos.', variant: 'destructive' });
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.verifyOtp({
        email, token: otp, type: 'email',
      });
      if (error) throw error;
      if (data.session) navigate('/dashboard', { replace: true });
    } catch (err: any) {
      const msg = err.message?.toLowerCase() ?? '';
      const friendly =
        msg.includes('expired') ? 'Código expirado. Solicite um novo.' :
        msg.includes('invalid') ? 'Código incorreto. Verifique e tente novamente.' :
        err.message;
      toast({ title: 'Falha na verificação', description: friendly, variant: 'destructive' });
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center mb-4">
            <div className="bg-blue-600 p-3 rounded-full"><Scale className="h-8 w-8 text-white" /></div>
          </div>
          <h1 className="text-3xl font-bold text-white mb-1">WnevesBox</h1>
          <p className="text-blue-200 text-sm">Gestão Jurídica Inteligente</p>
        </div>

        <div className="bg-white rounded-2xl shadow-2xl p-8">
          {step === 'email' && (
            <>
              <div className="mb-5 text-center">
                <div className="inline-flex items-center justify-center w-12 h-12 bg-blue-100 rounded-full mb-3">
                  <Lock className="h-6 w-6 text-blue-600" />
                </div>
                <h2 className="text-xl font-bold text-gray-900">Entrar com segurança</h2>
                <p className="text-sm text-gray-500 mt-1">Enviaremos um código de 6 dígitos para o seu email.</p>
              </div>
              <form onSubmit={sendCode} className="space-y-4">
                <div>
                  <Label htmlFor="email">Email</Label>
                  <div className="relative mt-1">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input id="email" type="email" placeholder="seu@email.com"
                      value={email} onChange={e => setEmail(e.target.value)}
                      className="pl-9" required autoFocus />
                  </div>
                </div>
                <Button type="submit" className="w-full bg-blue-600 hover:bg-blue-700" disabled={loading || !email}>
                  {loading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Enviando…</>
                    : <><ArrowRight className="h-4 w-4 mr-2" />Enviar código</>}
                </Button>
              </form>
            </>
          )}

          {step === 'otp' && (
            <>
              <div className="mb-5 text-center">
                <div className="inline-flex items-center justify-center w-12 h-12 bg-emerald-100 rounded-full mb-3">
                  <ShieldCheck className="h-6 w-6 text-emerald-600" />
                </div>
                <h2 className="text-xl font-bold text-gray-900">Digite o código</h2>
                <p className="text-sm text-gray-500 mt-1">
                  Enviamos um código de 6 dígitos para <strong>{email}</strong>
                </p>
              </div>
              <form onSubmit={verifyCode} className="space-y-4">
                <div>
                  <Label htmlFor="otp">Código de verificação</Label>
                  <Input
                    id="otp"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    placeholder="000000"
                    value={otp}
                    onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    className="mt-1 text-center text-2xl font-mono tracking-[0.5em]"
                    autoFocus
                    required
                  />
                </div>
                <Button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-700" disabled={loading || otp.length !== 6}>
                  {loading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Verificando…</>
                    : <><CheckCircle2 className="h-4 w-4 mr-2" />Confirmar e entrar</>}
                </Button>
              </form>

              <div className="mt-4 flex items-center justify-between text-sm">
                <button onClick={() => { setStep('email'); setOtp(''); }}
                  className="text-gray-500 hover:text-gray-700">
                  ← Trocar email
                </button>
                <button
                  disabled={cooldown > 0 || loading}
                  onClick={() => sendCode()}
                  className="flex items-center gap-1 text-blue-600 hover:underline disabled:text-gray-400 disabled:no-underline disabled:cursor-not-allowed">
                  <RotateCcw className="h-3 w-3" />
                  {cooldown > 0 ? `Reenviar em ${cooldown}s` : 'Reenviar código'}
                </button>
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
