import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import {
  Scale, Mail, Loader2, ArrowRight, RotateCcw, Lock, CheckCircle2, ShieldCheck, ShieldAlert,
} from 'lucide-react';

type Step = 'email' | 'otp';

// ── Anti-bot / rate limit (lado cliente) ─────────────────────────────
const SEND_KEY = 'wb_otp_send_attempts';
const VERIFY_KEY = 'wb_otp_verify_attempts';
const HONEYPOT_FIELD = 'company_website'; // bots tendem a preencher

const SEND_MAX = 5;            // máx envios em janela
const SEND_WINDOW_MS = 15 * 60 * 1000; // 15 min
const SEND_BLOCK_MS = 30 * 60 * 1000;  // bloqueio 30 min

const VERIFY_MAX = 5;          // máx tentativas de código por email
const VERIFY_BLOCK_MS = 15 * 60 * 1000;

type Attempts = { count: number; first: number; blockedUntil?: number };

function readAttempts(key: string, scope: string): Attempts {
  try {
    const raw = localStorage.getItem(`${key}:${scope}`);
    return raw ? JSON.parse(raw) : { count: 0, first: 0 };
  } catch { return { count: 0, first: 0 }; }
}
function writeAttempts(key: string, scope: string, val: Attempts) {
  try { localStorage.setItem(`${key}:${scope}`, JSON.stringify(val)); } catch {}
}
function clearAttempts(key: string, scope: string) {
  try { localStorage.removeItem(`${key}:${scope}`); } catch {}
}

const OTP_TTL_SEC = 300; // 5 min — padrão Supabase

export default function Auth() {
  const [step, setStep]       = useState<Step>('email');
  const [email, setEmail]     = useState('');
  const [otp, setOtp]         = useState('');
  const [loading, setLoading] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [honeypot, setHoneypot] = useState('');
  const [formMountedAt] = useState(() => Date.now());
  const [blockedUntil, setBlockedUntil] = useState<number>(0);
  const [otpExpiresAt, setOtpExpiresAt] = useState<number>(0);
  const [now, setNow] = useState<number>(Date.now());
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

  // Tick global (1s) — atualiza countdowns de bloqueio e expiração do OTP
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (blockedUntil > 0 && now >= blockedUntil) setBlockedUntil(0);
  }, [now, blockedUntil]);

  const blockRemaining = useMemo(() => {
    if (!blockedUntil) return 0;
    return Math.max(0, Math.ceil((blockedUntil - now) / 1000));
  }, [blockedUntil, now]);

  const otpRemaining = useMemo(() => {
    if (!otpExpiresAt) return 0;
    return Math.max(0, Math.ceil((otpExpiresAt - now) / 1000));
  }, [otpExpiresAt, now]);

  const otpExpired = otpExpiresAt > 0 && otpRemaining === 0;

  const formatRemain = (s: number) => {
    const m = Math.floor(s / 60); const r = s % 60;
    return m > 0 ? `${m}m ${r.toString().padStart(2, '0')}s` : `${r}s`;
  };

  // Passo 1 — solicita o código por email
  const sendCode = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!email) return;
    const normalized = email.trim().toLowerCase();

    if (honeypot) {
      toast({ title: 'Solicitação bloqueada', description: 'Atividade suspeita detectada.', variant: 'destructive' });
      return;
    }
    if (Date.now() - formMountedAt < 1500) {
      toast({ title: 'Aguarde um instante', description: 'Tente novamente em alguns segundos.', variant: 'destructive' });
      return;
    }

    const now = Date.now();
    const att = readAttempts(SEND_KEY, normalized);
    if (att.blockedUntil && att.blockedUntil > now) {
      setBlockedUntil(att.blockedUntil);
      toast({ title: 'Muitas solicitações', description: `Aguarde ${formatRemain(Math.ceil((att.blockedUntil - now) / 1000))} antes de tentar novamente.`, variant: 'destructive' });
      return;
    }
    const inWindow = att.first && now - att.first < SEND_WINDOW_MS;
    const nextCount = inWindow ? att.count + 1 : 1;
    const first = inWindow ? att.first : now;
    if (nextCount > SEND_MAX) {
      const blockedUntilTs = now + SEND_BLOCK_MS;
      writeAttempts(SEND_KEY, normalized, { count: nextCount, first, blockedUntil: blockedUntilTs });
      setBlockedUntil(blockedUntilTs);
      toast({ title: 'Limite de envios atingido', description: `Máximo de ${SEND_MAX} envios atingido. Tente novamente em ${formatRemain(SEND_BLOCK_MS / 1000)}.`, variant: 'destructive' });
      return;
    }
    writeAttempts(SEND_KEY, normalized, { count: nextCount, first });

    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: normalized,
        options: { shouldCreateUser: true },
      });
      if (error) throw error;
      setStep('otp');
      setOtp('');
      setCooldown(60);
      setOtpExpiresAt(Date.now() + OTP_TTL_SEC * 1000);
      toast({ title: 'Código enviado!', description: `Verifique a caixa de entrada de ${normalized}` });
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
    const normalized = email.trim().toLowerCase();
    const now = Date.now();
    const att = readAttempts(VERIFY_KEY, normalized);
    if (att.blockedUntil && att.blockedUntil > now) {
      setBlockedUntil(att.blockedUntil);
      toast({ title: 'Muitas tentativas', description: `Verificação bloqueada. Aguarde ${formatRemain(Math.ceil((att.blockedUntil - now) / 1000))}.`, variant: 'destructive' });
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.auth.verifyOtp({
        email: normalized, token: otp, type: 'email',
      });
      if (error) throw error;
      if (data.session) {
        clearAttempts(VERIFY_KEY, normalized);
        clearAttempts(SEND_KEY, normalized);
        navigate('/dashboard', { replace: true });
      }
    } catch (err: any) {
      const next = (att.count || 0) + 1;
      if (next >= VERIFY_MAX) {
        const blockedUntilTs = now + VERIFY_BLOCK_MS;
        writeAttempts(VERIFY_KEY, normalized, { count: next, first: att.first || now, blockedUntil: blockedUntilTs });
        setBlockedUntil(blockedUntilTs);
        toast({ title: 'Conta bloqueada temporariamente', description: `Após ${VERIFY_MAX} tentativas falhas, aguarde ${formatRemain(VERIFY_BLOCK_MS / 1000)}.`, variant: 'destructive' });
      } else {
        writeAttempts(VERIFY_KEY, normalized, { count: next, first: att.first || now });
        const msg = err.message?.toLowerCase() ?? '';
        const friendly =
          msg.includes('expired') ? 'Código expirado. Solicite um novo.' :
          msg.includes('invalid') ? `Código incorreto. Tentativas restantes: ${VERIFY_MAX - next}.` :
          err.message;
        toast({ title: 'Falha na verificação', description: friendly, variant: 'destructive' });
      }
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
              {blockRemaining > 0 && (
                <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                  <ShieldAlert className="h-4 w-4 mt-0.5 shrink-0" />
                  <span>Acesso temporariamente bloqueado por segurança. Tente novamente em <strong>{formatRemain(blockRemaining)}</strong>.</span>
                </div>
              )}
              <form onSubmit={sendCode} className="space-y-4" autoComplete="on">
                <div>
                  <Label htmlFor="email">Email</Label>
                  <div className="relative mt-1">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input id="email" type="email" placeholder="seu@email.com"
                      value={email} onChange={e => setEmail(e.target.value)}
                      className="pl-9" required autoFocus />
                  </div>
                </div>
                {/* Honeypot — invisível para humanos, atrai bots */}
                <div aria-hidden="true" style={{ position: 'absolute', left: '-10000px', top: 'auto', width: 1, height: 1, overflow: 'hidden' }}>
                  <label htmlFor={HONEYPOT_FIELD}>Não preencha este campo</label>
                  <input
                    id={HONEYPOT_FIELD}
                    name={HONEYPOT_FIELD}
                    type="text"
                    tabIndex={-1}
                    autoComplete="off"
                    value={honeypot}
                    onChange={e => setHoneypot(e.target.value)}
                  />
                </div>
                <Button type="submit" className="w-full bg-blue-600 hover:bg-blue-700" disabled={loading || !email || blockRemaining > 0}>
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
                <Button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-700" disabled={loading || otp.length !== 6 || blockRemaining > 0}>
                  {loading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Verificando…</>
                    : <><CheckCircle2 className="h-4 w-4 mr-2" />Confirmar e entrar</>}
                </Button>
              </form>

              {blockRemaining > 0 && (
                <div className="mt-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                  <ShieldAlert className="h-4 w-4 mt-0.5 shrink-0" />
                  <span>Verificação bloqueada por segurança. Tente novamente em <strong>{formatRemain(blockRemaining)}</strong>.</span>
                </div>
              )}

              <div className="mt-4 flex items-center justify-between text-sm">
                <button onClick={() => { setStep('email'); setOtp(''); }}
                  className="text-gray-500 hover:text-gray-700">
                  ← Trocar email
                </button>
                <button
                  disabled={cooldown > 0 || loading || blockRemaining > 0}
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
