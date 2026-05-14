import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { InputOTP, InputOTPGroup, InputOTPSlot, InputOTPSeparator } from '@/components/ui/input-otp';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { TurnstileWidget } from '@/components/TurnstileWidget';
import {
  Scale, Mail, Loader2, ArrowRight, RotateCcw, Lock, CheckCircle2, ShieldCheck, ShieldAlert, KeyRound,
} from 'lucide-react';

function translateLoginError(message: string): string {
  if (!message) return 'Erro inesperado. Tente novamente.';
  const m = message.toLowerCase();
  if (m.includes('invalid login credentials')) return 'E-mail ou senha incorretos.';
  if (m.includes('email not confirmed')) return 'Confirme seu e-mail antes de entrar.';
  if (m.includes('too many requests') || m.includes('rate limit')) return 'Muitas tentativas. Aguarde alguns minutos.';
  if (m.includes('user not found')) return 'Usuário não encontrado.';
  return message;
}

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

const OTP_LENGTH = 6;
const OTP_TTL_SEC = 600; // 10 min
const RESEND_COOLDOWN_SEC = 60;
const LAST_REQUEST_KEY = 'wb_otp_last_request'; // { email, requestedAt }
const PUBLIC_FUNCTION_TIMEOUT_MS = 15000;

async function invokePublicFunction<T>(name: string, body: unknown): Promise<T> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), PUBLIC_FUNCTION_TIMEOUT_MS);

  try {
    const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${name}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload?.error) {
      throw Object.assign(new Error(payload?.error || 'request_failed'), payload);
    }
    return payload as T;
  } catch (error: any) {
    if (error?.name === 'AbortError') throw new Error('timeout');
    throw error;
  } finally {
    window.clearTimeout(timer);
  }
}

function readLastRequest(): { email: string; requestedAt: number } | null {
  try {
    const raw = localStorage.getItem(LAST_REQUEST_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.email === 'string' && typeof parsed.requestedAt === 'number') return parsed;
  } catch {}
  return null;
}
function writeLastRequest(email: string) {
  try { localStorage.setItem(LAST_REQUEST_KEY, JSON.stringify({ email, requestedAt: Date.now() })); } catch {}
}
function clearLastRequest() {
  try { localStorage.removeItem(LAST_REQUEST_KEY); } catch {}
}

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
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [needsCaptcha, setNeedsCaptcha] = useState(false);
  const [mode, setMode] = useState<'otp' | 'password'>('otp');
  const [password, setPassword] = useState('');
  const [resetSending, setResetSending] = useState(false);
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

  // Rehidrata último email solicitado e cooldown remanescente (cross-reload)
  useEffect(() => {
    const last = readLastRequest();
    if (!last) return;
    const elapsed = Math.floor((Date.now() - last.requestedAt) / 1000);
    if (elapsed < RESEND_COOLDOWN_SEC) {
      setEmail(last.email);
      setCooldown(RESEND_COOLDOWN_SEC - elapsed);
    }
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

  // Dispara o OTP por email via edge function customizada (Resend)
  const dispatchOtp = async (normalized: string) => {
    const data = await invokePublicFunction<{ success?: boolean; expires_at?: string; captcha_required?: boolean }>('send-otp-resend', {
      email: normalized,
      captcha_token: captchaToken,
    }).catch((error: any) => {
      if (error?.captcha_required) setNeedsCaptcha(true);
      throw error;
    });
    setOtp('');
    setCaptchaToken(null);
    setCooldown(RESEND_COOLDOWN_SEC);
    const expiresAt = data?.expires_at ? new Date(data.expires_at).getTime() : Date.now() + OTP_TTL_SEC * 1000;
    setOtpExpiresAt(expiresAt);
    writeLastRequest(normalized);
  };

  // Passo 1 — envia o código por email via Resend
  const loginAndSendCode = async (e?: React.FormEvent) => {
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

    const tNow = Date.now();
    const att = readAttempts(SEND_KEY, normalized);
    if (att.blockedUntil && att.blockedUntil > tNow) {
      setBlockedUntil(att.blockedUntil);
      toast({ title: 'Muitas solicitações', description: `Aguarde ${formatRemain(Math.ceil((att.blockedUntil - tNow) / 1000))} antes de tentar novamente.`, variant: 'destructive' });
      return;
    }
    const inWindow = att.first && tNow - att.first < SEND_WINDOW_MS;
    const nextCount = inWindow ? att.count + 1 : 1;
    const first = inWindow ? att.first : tNow;
    if (nextCount > SEND_MAX) {
      const blockedUntilTs = tNow + SEND_BLOCK_MS;
      writeAttempts(SEND_KEY, normalized, { count: nextCount, first, blockedUntil: blockedUntilTs });
      setBlockedUntil(blockedUntilTs);
      toast({ title: 'Limite de envios atingido', description: `Máximo de ${SEND_MAX} envios atingido. Tente novamente em ${formatRemain(SEND_BLOCK_MS / 1000)}.`, variant: 'destructive' });
      return;
    }
    writeAttempts(SEND_KEY, normalized, { count: nextCount, first });

    setLoading(true);
    try {
      await dispatchOtp(normalized);
      setStep('otp');
      toast({ title: 'Código enviado!', description: `Verifique a caixa de entrada de ${normalized}` });
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message || 'Falha ao enviar código', variant: 'destructive' });
    } finally { setLoading(false); }
  };

  // Reenvio do OTP (na tela do código)
  const resendCode = async () => {
    if (!email) return;
    const normalized = email.trim().toLowerCase();
    setLoading(true);
    try {
      await dispatchOtp(normalized);
      toast({ title: 'Código reenviado', description: `Novo código enviado para ${normalized}` });
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    } finally { setLoading(false); }
  };

  // Passo 2 — valida o código de 6 dígitos via edge function customizada
  const verifyCode = async (eOrCode?: React.FormEvent | string) => {
    let codeToVerify = otp;
    if (typeof eOrCode === 'string') {
      codeToVerify = eOrCode;
    } else if (eOrCode && typeof (eOrCode as React.FormEvent).preventDefault === 'function') {
      (eOrCode as React.FormEvent).preventDefault();
    }
    if (codeToVerify.length !== OTP_LENGTH) {
      toast({ title: 'Código inválido', description: `Digite os ${OTP_LENGTH} dígitos.`, variant: 'destructive' });
      return;
    }
    if (otpExpiresAt > 0 && Date.now() >= otpExpiresAt) {
      toast({ title: 'Código expirado', description: 'Solicite um novo código para continuar.', variant: 'destructive' });
      return;
    }
    const normalized = email.trim().toLowerCase();
    const ts = Date.now();
    const att = readAttempts(VERIFY_KEY, normalized);
    if (att.blockedUntil && att.blockedUntil > ts) {
      setBlockedUntil(att.blockedUntil);
      toast({ title: 'Muitas tentativas', description: `Verificação bloqueada. Aguarde ${formatRemain(Math.ceil((att.blockedUntil - ts) / 1000))}.`, variant: 'destructive' });
      return;
    }

    setLoading(true);
    try {
      // 1) Valida o código numérico via edge function
      const payload = await invokePublicFunction<any>('verify-otp-resend', { email: normalized, code: codeToVerify });
      if (!payload?.ok || !payload?.token_hash) throw new Error(payload?.error || 'verify_failed');

      // 2) Troca o token_hash por uma sessão real no client
      const { data: sessData, error: sessError } = await supabase.auth.verifyOtp({
        type: 'magiclink',
        token_hash: payload.token_hash,
      });
      if (sessError) throw sessError;
      if (sessData.session) {
        clearAttempts(VERIFY_KEY, normalized);
        clearAttempts(SEND_KEY, normalized);
        setOtpExpiresAt(0);
        clearLastRequest();
        navigate('/dashboard', { replace: true });
      } else {
        throw new Error('no_session');
      }
    } catch (err: any) {
      const next = (att.count || 0) + 1;
      if (next >= VERIFY_MAX) {
        const blockedUntilTs = ts + VERIFY_BLOCK_MS;
        writeAttempts(VERIFY_KEY, normalized, { count: next, first: att.first || ts, blockedUntil: blockedUntilTs });
        setBlockedUntil(blockedUntilTs);
        toast({ title: 'Conta bloqueada temporariamente', description: `Após ${VERIFY_MAX} tentativas falhas, aguarde ${formatRemain(VERIFY_BLOCK_MS / 1000)}.`, variant: 'destructive' });
      } else {
        writeAttempts(VERIFY_KEY, normalized, { count: next, first: att.first || ts });
        const msg = (err.message || '').toLowerCase();
        const friendly =
          msg.includes('expired') || msg.includes('not_found') ? 'Código expirado. Solicite um novo.' :
          msg.includes('too_many') ? 'Muitas tentativas. Solicite um novo código.' :
          msg.includes('invalid_code') || msg.includes('invalid') ? `Código incorreto. Tentativas restantes: ${err.remaining ?? (VERIFY_MAX - next)}.` :
          err.message || 'Falha na verificação';
        toast({ title: 'Falha na verificação', description: friendly, variant: 'destructive' });
        if (msg.includes('expired') || msg.includes('not_found')) setOtpExpiresAt(Date.now() - 1);
      }
    } finally { setLoading(false); }
  };

  // ── Login por SENHA ────────────────────────────────────────────────
  const signInWithPassword = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!email || !password) return;
    if (honeypot) return;
    const normalized = email.trim().toLowerCase();
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: normalized, password });
      if (error) throw error;
      navigate('/dashboard', { replace: true });
    } catch (err: any) {
      toast({ title: 'Falha no login', description: translateLoginError(err.message), variant: 'destructive' });
    } finally { setLoading(false); }
  };

  // ── Esqueci minha senha ────────────────────────────────────────────
  const sendPasswordReset = async () => {
    if (!email) {
      toast({ title: 'Informe o e-mail', description: 'Digite o e-mail para receber o link de redefinição.', variant: 'destructive' });
      return;
    }
    const normalized = email.trim().toLowerCase();
    setResetSending(true);
    try {
      await invokePublicFunction<{ success?: boolean }>('request-password-reset', {
        email: normalized,
        redirect_to: `${window.location.origin}/#/reset-password`,
      });
      toast({ title: 'E-mail enviado', description: `Verifique a caixa de entrada de ${normalized} para redefinir a senha.` });
    } catch (err: any) {
      toast({ title: 'Erro', description: translateLoginError(err.message), variant: 'destructive' });
    } finally { setResetSending(false); }
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
            <Tabs value={mode} onValueChange={(v) => setMode(v as 'otp' | 'password')} className="mb-5">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="otp"><ShieldCheck className="h-4 w-4 mr-1" />Código</TabsTrigger>
                <TabsTrigger value="password"><KeyRound className="h-4 w-4 mr-1" />Senha</TabsTrigger>
              </TabsList>
            </Tabs>
          )}
          {step === 'email' && mode === 'password' && (
            <>
              <div className="mb-5 text-center">
                <div className="inline-flex items-center justify-center w-12 h-12 bg-blue-100 rounded-full mb-3">
                  <KeyRound className="h-6 w-6 text-blue-600" />
                </div>
                <h2 className="text-xl font-bold text-gray-900">Entrar com senha</h2>
                <p className="text-sm text-gray-500 mt-1">Use seu e-mail e senha cadastrados.</p>
              </div>
              <form onSubmit={signInWithPassword} className="space-y-4" autoComplete="on">
                <div>
                  <Label htmlFor="email-pw">Email</Label>
                  <div className="relative mt-1">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input id="email-pw" type="email" placeholder="seu@email.com"
                      value={email} onChange={e => setEmail(e.target.value)}
                      className="pl-9" required autoComplete="email" />
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password">Senha</Label>
                    <button type="button" onClick={sendPasswordReset} disabled={resetSending}
                      className="text-xs text-blue-600 hover:underline disabled:text-gray-400">
                      {resetSending ? 'Enviando…' : 'Esqueci minha senha'}
                    </button>
                  </div>
                  <div className="relative mt-1">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input id="password" type="password" placeholder="••••••••"
                      value={password} onChange={e => setPassword(e.target.value)}
                      className="pl-9" required autoComplete="current-password" minLength={6} />
                  </div>
                </div>
                <Button type="submit" className="w-full bg-blue-600 hover:bg-blue-700" disabled={loading || !email || !password}>
                  {loading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Entrando…</>
                    : <><ArrowRight className="h-4 w-4 mr-2" />Entrar</>}
                </Button>
              </form>
            </>
          )}
          {step === 'email' && mode === 'otp' && (
            <>
              <div className="mb-5 text-center">
                <div className="inline-flex items-center justify-center w-12 h-12 bg-blue-100 rounded-full mb-3">
                  <Lock className="h-6 w-6 text-blue-600" />
                </div>
                <h2 className="text-xl font-bold text-gray-900">Entrar com segurança</h2>
                <p className="text-sm text-gray-500 mt-1">Informe seu email — enviaremos um código de 6 dígitos para concluir o login.</p>
              </div>
              {blockRemaining > 0 && (
                <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                  <ShieldAlert className="h-4 w-4 mt-0.5 shrink-0" />
                  <span>Acesso temporariamente bloqueado por segurança. Tente novamente em <strong>{formatRemain(blockRemaining)}</strong>.</span>
                </div>
              )}
              <form onSubmit={loginAndSendCode} className="space-y-4" autoComplete="on">
                <div>
                  <Label htmlFor="email">Email</Label>
                  <div className="relative mt-1">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input id="email" type="email" placeholder="seu@email.com"
                      value={email} onChange={e => setEmail(e.target.value)}
                      className="pl-9" required autoFocus autoComplete="email" />
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
                {needsCaptcha && !captchaToken && (
                  <div className="text-xs text-muted-foreground">
                    <TurnstileWidget onToken={(t) => setCaptchaToken(t)} onError={() => setNeedsCaptcha(true)} />
                    Verificação de segurança em andamento…
                  </div>
                )}
                <Button type="submit" className="w-full bg-blue-600 hover:bg-blue-700" disabled={loading || !email || blockRemaining > 0 || (needsCaptcha && !captchaToken)}>
                  {loading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Enviando…</>
                    : <><ArrowRight className="h-4 w-4 mr-2" />Continuar</>}
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
                  Enviamos um código de {OTP_LENGTH} dígitos para <strong>{email}</strong>
                </p>
              </div>
              {otpExpiresAt > 0 && (
                <div className={`mb-4 flex items-center justify-center gap-2 rounded-lg border p-2 text-sm font-medium ${
                  otpExpired
                    ? 'border-red-200 bg-red-50 text-red-700'
                    : otpRemaining <= 60
                      ? 'border-amber-200 bg-amber-50 text-amber-800'
                      : 'border-emerald-200 bg-emerald-50 text-emerald-700'
                }`}>
                  {otpExpired ? (
                    <><ShieldAlert className="h-4 w-4" /> Código expirado — solicite um novo</>
                  ) : (
                    <><Lock className="h-4 w-4" /> Expira em <span className="font-mono tabular-nums">{formatRemain(otpRemaining)}</span></>
                  )}
                </div>
              )}
              <form onSubmit={verifyCode} className="space-y-4">
                <div className="flex flex-col items-center gap-2">
                  <Label htmlFor="otp" className="self-start">Código de verificação</Label>
                  <InputOTP
                    id="otp"
                    maxLength={OTP_LENGTH}
                    value={otp}
                    onChange={(v) => {
                      const clean = v.replace(/\D/g, '').slice(0, OTP_LENGTH);
                      setOtp(clean);
                      // Auto-submit ao completar o código (passa o valor diretamente p/ evitar race com setState)
                      if (clean.length === OTP_LENGTH && !loading && !otpExpired && blockRemaining === 0) {
                        setTimeout(() => verifyCode(clean), 50);
                      }
                    }}
                    onComplete={() => { /* tratado em onChange */ }}
                    disabled={otpExpired || loading}
                    autoFocus
                    containerClassName="justify-center"
                  >
                    <InputOTPGroup>
                      <InputOTPSlot index={0} className="h-12 w-11 text-xl font-semibold" />
                      <InputOTPSlot index={1} className="h-12 w-11 text-xl font-semibold" />
                      <InputOTPSlot index={2} className="h-12 w-11 text-xl font-semibold" />
                    </InputOTPGroup>
                    <InputOTPSeparator />
                    <InputOTPGroup>
                      <InputOTPSlot index={3} className="h-12 w-11 text-xl font-semibold" />
                      <InputOTPSlot index={4} className="h-12 w-11 text-xl font-semibold" />
                      <InputOTPSlot index={5} className="h-12 w-11 text-xl font-semibold" />
                    </InputOTPGroup>
                  </InputOTP>
                  <p className="text-xs text-gray-400 mt-1">Dica: você pode colar o código copiado do email</p>
                </div>
                <Button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-700" disabled={loading || otp.length !== OTP_LENGTH || blockRemaining > 0 || otpExpired}>
                  {loading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Verificando…</>
                    : otpExpired ? <><ShieldAlert className="h-4 w-4 mr-2" />Código expirado</>
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
                <button onClick={() => { setStep('email'); setOtp(''); setOtpExpiresAt(0); clearLastRequest(); }}
                  className="text-gray-500 hover:text-gray-700">
                  ← Trocar email
                </button>
                <button
                  disabled={cooldown > 0 || loading || blockRemaining > 0 || !email}
                  onClick={() => resendCode()}
                  title={cooldown > 0 ? `Aguarde ${cooldown}s para reenviar` : `Reenviar código para ${email}`}
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
