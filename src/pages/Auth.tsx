import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Scale, Mail, Shield, Loader2, ArrowRight, RotateCcw, CheckCircle2 } from 'lucide-react';

type Step = 'email' | 'link-sent';

const SITE_URL = 'https://wnevesadvocacia-cpu.github.io/full-feature-replication/';

export default function Auth() {
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const navigate = useNavigate();
  const { toast } = useToast();

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

  const sendMagicLink = async (emailAddr: string) => {
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: emailAddr,
        options: {
          shouldCreateUser: true,
          emailRedirectTo: SITE_URL,
        },
      });
      if (error) throw error;
      setStep('link-sent');
      setResendCooldown(60);
      toast({
        title: 'Link enviado!',
        description: `Verifique o email ${emailAddr} e clique no link de acesso.`,
      });
    } catch (err: any) {
      toast({ title: 'Erro ao enviar link', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    await sendMagicLink(email.trim());
  };

  const handleResend = async () => {
    if (resendCooldown > 0) return;
    await sendMagicLink(email);
  };

  const handleBack = () => {
    setStep('email');
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
                  Enviaremos um link de acesso para seu email.
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
                    <><ArrowRight className="h-4 w-4 mr-2" />Enviar link de acesso</>
                  )}
                </Button>
              </form>

              <div className="mt-6 pt-4 border-t border-gray-100 flex items-center gap-2 text-xs text-gray-400">
                <Shield className="h-3.5 w-3.5 shrink-0" />
                <span>Acesso seguro via link de uso unico. Sem senha necessaria.</span>
              </div>
            </>
          ) : (
            <>
              <div className="mb-6 text-center">
                <div className="inline-flex items-center justify-center w-12 h-12 bg-green-100 rounded-full mb-3">
                  <CheckCircle2 className="h-6 w-6 text-green-600" />
                </div>
                <h2 className="text-xl font-bold text-gray-900">Verifique seu email</h2>
                <p className="text-sm text-gray-500 mt-2">
                  Enviamos um link de acesso para:
                </p>
                <p className="text-sm font-semibold text-gray-800 mt-1">{email}</p>
              </div>

              <div className="bg-blue-50 rounded-xl p-4 mb-6 text-center">
                <Mail className="h-8 w-8 text-blue-500 mx-auto mb-2" />
                <p className="text-sm text-blue-700 font-medium">
                  Abra seu email e clique em <strong>"Log In"</strong>
                </p>
                <p className="text-xs text-blue-500 mt-1">
                  O link abrira o WnevesBox automaticamente.
                </p>
              </div>

              <div className="flex items-center justify-between text-sm">
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
                  {resendCooldown > 0 ? `Reenviar em ${resendCooldown}s` : 'Reenviar link'}
                </button>
              </div>

              <div className="mt-4 pt-4 border-t border-gray-100 text-xs text-gray-400 text-center">
                Nao encontrou? Verifique a pasta de spam.
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
