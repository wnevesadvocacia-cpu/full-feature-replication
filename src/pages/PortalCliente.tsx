import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { SignaturePad } from '@/components/SignaturePad';
import { Briefcase, Receipt, AlertCircle, Loader2, Scale, FileSignature, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';

export default function PortalCliente() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<any>(null);
  const [signatures, setSignatures] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openSig, setOpenSig] = useState<any>(null);
  const [signerName, setSignerName] = useState('');
  const [signing, setSigning] = useState(false);

  const loadAll = async () => {
    if (!token) return;
    try {
      const [{ data: portal, error: e1 }, { data: sigs, error: e2 }] = await Promise.all([
        supabase.rpc('get_client_portal_data', { _token: token }),
        supabase.rpc('get_portal_signatures', { _token: token }),
      ]);
      if (e1) throw e1;
      if (e2) throw e2;
      if ((portal as any)?.error) throw new Error('Token inválido ou expirado');
      setData(portal);
      setSignatures(Array.isArray(sigs) ? sigs : []);
    } catch (e: any) {
      setError(e.message);
    } finally { setLoading(false); }
  };

  useEffect(() => { loadAll(); /* eslint-disable-next-line */ }, [token]);

  const fmt = (n: any) => Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  const handleSign = async (dataUrl: string) => {
    if (!signerName.trim()) {
      toast.error('Informe seu nome completo antes de assinar');
      return;
    }
    setSigning(true);
    try {
      const { data: res, error } = await supabase.rpc('sign_portal_document', {
        _token: token!, _request_id: openSig.id, _signature_data_url: dataUrl, _signer_name: signerName.trim(),
      });
      if (error) throw error;
      if ((res as any)?.error) throw new Error((res as any).error);
      toast.success('Documento assinado com sucesso!');
      setOpenSig(null);
      setSignerName('');
      await loadAll();
    } catch (e: any) {
      toast.error('Erro ao assinar: ' + e.message);
    } finally { setSigning(false); }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <Card className="max-w-md w-full">
          <CardContent className="p-8 text-center space-y-3">
            <AlertCircle className="h-12 w-12 mx-auto text-destructive" />
            <h1 className="text-xl font-semibold">Acesso indisponível</h1>
            <p className="text-sm text-muted-foreground">{error || 'Token não encontrado.'}</p>
            <p className="text-xs text-muted-foreground">Solicite um novo link ao seu advogado.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { client, processes = [], invoices = [] } = data;
  const pendingSigs = signatures.filter(s => s.status === 'pendente');

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="bg-card border-b">
        <div className="max-w-4xl mx-auto px-6 py-5 flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary flex items-center justify-center">
            <Scale className="h-5 w-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="font-display font-bold text-lg">Portal do Cliente</h1>
            <p className="text-xs text-muted-foreground">Acompanhe seus processos e faturas</p>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8 space-y-6">
        <Card>
          <CardContent className="p-6">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Bem-vindo(a)</p>
            <h2 className="text-2xl font-display font-bold mt-1">{client?.name}</h2>
            {client?.email && <p className="text-sm text-muted-foreground mt-1">{client.email}</p>}
          </CardContent>
        </Card>

        {/* Documentos para assinar */}
        {signatures.length > 0 && (
          <section>
            <h3 className="font-semibold flex items-center gap-2 mb-3">
              <FileSignature className="h-4 w-4 text-primary" />
              Documentos para assinar
              {pendingSigs.length > 0 && (
                <Badge variant="destructive" className="ml-1">{pendingSigs.length} pendente{pendingSigs.length !== 1 ? 's' : ''}</Badge>
              )}
            </h3>
            <div className="space-y-3">
              {signatures.map((s) => (
                <Card key={s.id} className={s.status === 'pendente' ? 'border-primary/40' : ''}>
                  <CardContent className="p-4 flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{s.title}</p>
                      {s.description && <p className="text-sm text-muted-foreground mt-1">{s.description}</p>}
                      <p className="text-xs text-muted-foreground mt-2">
                        Solicitado em {new Date(s.created_at).toLocaleDateString('pt-BR')}
                        {s.signed_at && ` · Assinado em ${new Date(s.signed_at).toLocaleDateString('pt-BR')}`}
                      </p>
                    </div>
                    {s.status === 'pendente' ? (
                      <button
                        onClick={() => setOpenSig(s)}
                        className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90"
                      >
                        Assinar agora
                      </button>
                    ) : (
                      <Badge variant={s.status === 'assinado' ? 'default' : 'secondary'} className="gap-1">
                        {s.status === 'assinado' && <CheckCircle2 className="h-3 w-3" />}
                        {s.status}
                      </Badge>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>
        )}

        <section>
          <h3 className="font-semibold flex items-center gap-2 mb-3">
            <Briefcase className="h-4 w-4 text-primary" />
            Seus processos ({processes.length})
          </h3>
          {processes.length === 0 ? (
            <Card><CardContent className="p-6 text-sm text-muted-foreground text-center">Nenhum processo ativo.</CardContent></Card>
          ) : (
            <div className="space-y-3">
              {processes.map((p: any) => (
                <Card key={p.id}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-mono text-muted-foreground">{p.number}</p>
                        <p className="font-medium mt-1">{p.title}</p>
                        <div className="flex flex-wrap gap-2 mt-2 text-xs text-muted-foreground">
                          {p.tribunal && <span>🏛 {p.tribunal}</span>}
                          {p.vara && <span>⚖ {p.vara}</span>}
                          {p.comarca && <span>📍 {p.comarca}</span>}
                        </div>
                      </div>
                      <Badge variant="outline">{p.status}</Badge>
                    </div>
                    {p.last_update && (
                      <p className="text-xs text-muted-foreground mt-3">
                        Última atualização: {new Date(p.last_update).toLocaleDateString('pt-BR')}
                      </p>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </section>

        <section>
          <h3 className="font-semibold flex items-center gap-2 mb-3">
            <Receipt className="h-4 w-4 text-primary" />
            Suas faturas ({invoices.length})
          </h3>
          {invoices.length === 0 ? (
            <Card><CardContent className="p-6 text-sm text-muted-foreground text-center">Nenhuma fatura.</CardContent></Card>
          ) : (
            <Card>
              <CardContent className="p-0">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-xs uppercase">
                    <tr><th className="px-4 py-2 text-left">Número</th><th className="px-4 py-2 text-left">Vencimento</th><th className="px-4 py-2 text-right">Valor</th><th className="px-4 py-2">Status</th></tr>
                  </thead>
                  <tbody className="divide-y">
                    {invoices.map((i: any, idx: number) => (
                      <tr key={idx}>
                        <td className="px-4 py-2 font-mono text-xs">{i.number}</td>
                        <td className="px-4 py-2 text-muted-foreground">{i.due_date ? new Date(i.due_date).toLocaleDateString('pt-BR') : '—'}</td>
                        <td className="px-4 py-2 text-right font-mono">{fmt(i.amount)}</td>
                        <td className="px-4 py-2 text-center">
                          <Badge variant={i.status === 'paga' ? 'default' : i.status === 'vencida' ? 'destructive' : 'outline'}>{i.status}</Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}
        </section>

        <p className="text-xs text-muted-foreground text-center pt-4">
          Acesso somente leitura · Em caso de dúvidas, contate seu advogado.
        </p>
      </main>

      {/* Dialog de assinatura */}
      <Dialog open={!!openSig} onOpenChange={(o) => !o && setOpenSig(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Assinar: {openSig?.title}</DialogTitle>
            <DialogDescription>
              {openSig?.description || 'Confirme seu nome e assine no campo abaixo. Esta assinatura tem validade entre as partes.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Seu nome completo</label>
              <Input
                value={signerName}
                onChange={(e) => setSignerName(e.target.value)}
                placeholder="Como aparece no seu RG/CPF"
                className="mt-1"
                disabled={signing}
              />
            </div>
            <SignaturePad onSign={handleSign} disabled={signing} />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
