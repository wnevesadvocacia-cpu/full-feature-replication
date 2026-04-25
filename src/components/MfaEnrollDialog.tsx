// Sec-3.1 — Diálogo de enrollment TOTP (QR + verificação)
import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Shield, ShieldCheck, Copy } from 'lucide-react';

type Props = { open: boolean; onOpenChange: (v: boolean) => void; onEnrolled?: () => void };

export function MfaEnrollDialog({ open, onOpenChange, onEnrolled }: Props) {
  const { toast } = useToast();
  const [factorId, setFactorId] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(false);

  useEffect(() => {
    if (!open) { setFactorId(null); setQr(null); setSecret(null); setCode(''); return; }
    let cancel = false;
    (async () => {
      setLoading(true);
      try {
        // Limpa fatores não-verificados pendentes
        const { data: list } = await supabase.auth.mfa.listFactors();
        const pending = (list?.totp ?? []).filter((f: any) => f.status !== 'verified');
        for (const f of pending) await supabase.auth.mfa.unenroll({ factorId: f.id });

        const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: `WnevesBox-${Date.now()}` });
        if (error) throw error;
        if (cancel) return;
        setFactorId(data.id);
        setQr(data.totp.qr_code);
        setSecret(data.totp.secret);
      } catch (e: any) {
        toast({ title: 'Erro ao iniciar MFA', description: e.message, variant: 'destructive' });
        onOpenChange(false);
      } finally { if (!cancel) setLoading(false); }
    })();
    return () => { cancel = true; };
  }, [open]);

  const verify = async () => {
    if (!factorId || code.length !== 6) return;
    setVerifying(true);
    try {
      const { data: ch, error: chErr } = await supabase.auth.mfa.challenge({ factorId });
      if (chErr) throw chErr;
      const { error } = await supabase.auth.mfa.verify({ factorId, challengeId: ch.id, code });
      if (error) throw error;
      // Marca metadata
      await supabase.auth.updateUser({ data: { mfa_enrolled: true } });
      await supabase.rpc('log_auth_event', { _event: 'mfa_enrolled', _metadata: { factor_id: factorId } });
      toast({ title: 'MFA ativado', description: 'Sua conta agora está protegida com 2FA.' });
      onEnrolled?.();
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: 'Código inválido', description: e.message, variant: 'destructive' });
    } finally { setVerifying(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Shield className="h-5 w-5" /> Ativar autenticação em 2 fatores</DialogTitle>
          <DialogDescription>Escaneie o QR code com Google Authenticator, Authy ou 1Password e insira o código de 6 dígitos.</DialogDescription>
        </DialogHeader>
        {loading && (<div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>)}
        {!loading && qr && (
          <div className="space-y-4">
            <div className="flex justify-center bg-white p-4 rounded-lg border">
              <img src={qr} alt="QR code MFA" className="w-44 h-44" />
            </div>
            {secret && (
              <div className="rounded-md bg-muted p-3 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground">Não consegue escanear? Use a chave manual:</span>
                  <button type="button" onClick={() => { navigator.clipboard.writeText(secret); toast({ title: 'Copiado' }); }}
                    className="text-primary hover:underline flex items-center gap-1">
                    <Copy className="h-3 w-3" /> copiar
                  </button>
                </div>
                <code className="block mt-2 font-mono text-foreground break-all">{secret}</code>
              </div>
            )}
            <div>
              <Label htmlFor="mfa-code">Código de 6 dígitos</Label>
              <Input id="mfa-code" inputMode="numeric" maxLength={6} value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="000000" className="mt-1 tracking-widest text-center font-mono text-lg" />
            </div>
            <Button onClick={verify} disabled={code.length !== 6 || verifying} className="w-full">
              {verifying ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Verificando…</> : <><ShieldCheck className="h-4 w-4 mr-2" />Ativar 2FA</>}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
