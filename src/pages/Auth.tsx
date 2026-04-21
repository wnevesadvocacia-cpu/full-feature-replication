import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Scale, Mail, Shield, Loader2, ArrowRight, RotateCcw } from 'lucide-react';

type Step = 'email' | 'otp';

export default function Auth() {
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [loading, setLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const navigate = useNavigate();
  const { toast } = useToast();
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Redirect if already authenticated
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) navigate('/');
    });
  }, [navigate]);

  // Cooldown timer for resend
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setInterval(() => setResendCooldown((c) => c - 1), 1000);
    return () => clearInterval(t);
  }, [resendCooldown]);

  const sendOtp = async (emailAddr: string) => {
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: emailAddr,
        options: { shouldCreateUser: true },
      });
      if (error) throw error;
      setStep('otp');
      setResendCooldown(60);
      toast({
        title: 'Codigo enviado!',
        description: `Verifique o email ${emailAddr} e insira o codigo de 6 digitos.`,
      });
      // Focus first OTP input after a short delay
      setTimeout(() => inputRefs.current[0]?.focus(), 100);
    } catch (err: any) {
      toast({ title: 'Erro ao enviar codigo', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    await sendOtp(email.trim());
  };

  const handleOtpChange = (idx: number, value: string) => {
    // Accept only digits; handle paste of full 6-digit code
    const digits = value.replace(/\D/g, '');
    if (digits.length === 6) {
      const arr = digits.split('');
      setOtp(arr);
      inputRefs.current[5]?.focus();
      return;
    }
    const single = digits.slice(-1);
    const next = [...otp];
    next[idx] = single;
    setOtp(next);
    if (single && idx < 5) {
      inputRefs.current[idx + 1]?.focus();
    }
  };

  const handleOtpKeyDown = (idx: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !otp[idx] && idx > 0) {
      inputRefs.current[idx - 1]?.focus();
    }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    const token = otp.join('');
    if (token.length !== 6) {
      toast({ title: 'Insira o codigo completo de 6 digitos.', variant: 'destructive' });
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.verifyOtp({
        email,
        token,
        type: 'email',
      });
      if (error) throw error;
      navigate('/');
    } catch (err: any) {
      toast({ title: 'Codigo invalido ou expirado', description: err.message, variant: 'destructive' });
      // Clear OTP fields on error
      setOtp(['', '', '', '', '', '']);
      inputRefs.current[0]?.focus();
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (resendCooldown > 0) return;
    await sendOtp(email);
  };

  const handleBack = () => {
    setStep('email');
    setOtp(['', '', '', '', '', '']);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center mb-4">
            <div className="bg-blue-600 p-3 rounded-full">
              <Scale className="h-8 w-8 text-white" />
            </div>
          </div>
          <h1 className="text-3xl font-bold text-white mb-1">WnevesBox</h1>
          <p className="text-blue-200 text-sm">Gestao Juridica Inteligente</p>
        </div>

        <div className="bg-white rounded-2xl shadow-2xl p-8">
          {step === 'email' ? (
            <>
              <div className="mb-6 text-center">
                <div className="inline-flex items-center justify-center w-12 h-12 bg-blue-100 rounded-full mb-3">
                  <Mail className="h-6 w-6 text-blue-600" />
                </div>
                <h2 className="text-xl font-bold text-gray-900">Entrar</h2>
                <p className="text-sm text-gray-500 mt-1">
                  Enviaremos um codigo de acesso para seu email.
                </p>
              </div>

              <form onSubmit={handleEmailSubmit} className="space-y-4">
                <div>
                  <Label htmlFor="email" className="text-sm font-medium text-gray-700">
                    Email
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="seu@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoFocus
                    className="mt-1"
                  />
                </div>

                <Button type="submit" className="w-full bg-blue-600 hover:bg-blue-700" disabled={loading}>
                  {loading ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Enviando...</>
                  ) : (
                    <><ArrowRight className="h-4 w-4 mr-2" />Enviar codigo OTP</>
                  )}
                </Button>
              </form>

              <div className="mt-6 pt-4 border-t border-gray-100 flex items-center gap-2 text-xs text-gray-400">
                <Shield className="h-3.5 w-3.5 shrink-0" />
                <span>Acesso seguro via codigo de uso unico. Sem senha necessaria.</span>
              </div>
            </>
          ) : (
            <>
              <div className="mb-6 text-center">
                <div className="inline-flex items-center justify-center w-12 h-12 bg-green-100 rounded-full mb-3">
                  <Shield className="h-6 w-6 text-green-600" />
                </div>
                <h2 className="text-xl font-bold text-gray-900">Verificar codigo</h2>
                <p className="text-sm text-gray-500 mt-1">
                  Codigo enviado para <strong className="text-gray-700">{email}</strong>
                </p>
              </div>

              <form onSubmit={handleVerify} className="space-y-6">
                {/* 6-digit OTP inputs */}
                <div>
                  <Label className="text-sm font-medium text-gray-700 mb-3 block text-center">
                    Codigo de 6 digitos
                  </Label>
                  <div className="flex gap-2 justify-center">
                    {otp.map((digit, idx) => (
                      <input
                        key={idx}
                        ref={(el) => { inputRefs.current[idx] = el; }}
                        type="text"
                        inputMode="numeric"
                        maxLength={6}
                        value={digit}
                        onChange={(e) => handleOtpChange(idx, e.target.value)}
                        onKeyDown={(e) => handleOtpKeyDown(idx, e)}
                        className="w-11 h-12 text-center text-lg font-bold border-2 border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none transition-colors"
                      />
                    ))}
                  </div>
                </div>

                <Button
                  type="submit"
                  className="w-full bg-green-600 hover:bg-green-700"
                  disabled={loading || otp.join('').length !== 6}
                >
                  {loading ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Verificando...</>
                  ) : (
                    <><Shield className="h-4 w-4 mr-2" />Verificar e entrar</>
                  )}
                </Button>
              </form>

              <div className="mt-4 flex items-center justify-between text-sm">
                <button
                  type="button"
                  onClick={handleBack}
                  className="text-gray-400 hover:text-gray-600 flex items-center gap-1"
                >
                  <ArrowRight className="h-3.5 w-3.5 rotate-180" />
                  Trocar email
                </button>

                <button
                  type="button"
                  onClick={handleResend}
                  disabled={resendCooldown > 0}
                  className={`flex items-center gap-1 ${
                    resendCooldown > 0
                      ? 'text-gray-300 cursor-not-allowed'
                      : 'text-blue-600 hover:text-blue-800'
                  }`}
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  {resendCooldown > 0 ? `Reenviar em ${resendCooldown}s` : 'Reenviar codigo'}
                </button>
              </div>
            </>
          )}
        </div>

        <p className="text-center text-blue-300 text-xs mt-6">
          WnevesBox &copy; {new Date().getFullYear()} &mdash; Todos os direitos reservados
        </p>
      </div>
    </div>
  );
}
