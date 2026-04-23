import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Plus, Copy, Trash2, Link as LinkIcon, ExternalLink } from 'lucide-react';

export default function PortalAcessos() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [clientId, setClientId] = useState('');

  const { data: tokens = [] } = useQuery({
    queryKey: ['portal-tokens'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('client_portal_tokens')
        .select('id, client_id, token, active, expires_at, created_at, clients:client_id(name)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const { data: clients = [] } = useQuery({
    queryKey: ['clients-for-portal'],
    queryFn: async () => {
      const { data, error } = await supabase.from('clients').select('id, name').order('name').limit(2000);
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const create = useMutation({
    mutationFn: async () => {
      if (!clientId) throw new Error('Selecione um cliente');
      const token = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '').slice(0, 16);
      const { error } = await supabase.from('client_portal_tokens').insert({
        user_id: user!.id, client_id: clientId, token,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['portal-tokens'] });
      setOpen(false); setClientId('');
      toast({ title: 'Link gerado!' });
    },
    onError: (e: any) => toast({ title: 'Erro', description: e.message, variant: 'destructive' }),
  });

  const toggle = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await supabase.from('client_portal_tokens').update({ active }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['portal-tokens'] }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('client_portal_tokens').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['portal-tokens'] }),
  });

  const buildUrl = (token: string) => `${window.location.origin}${window.location.pathname}#/portal/${token}`;

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold">Portal do Cliente</h1>
          <p className="text-muted-foreground text-sm mt-1">Gere links de acesso para clientes consultarem processos e faturas.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4" />Novo link</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Gerar link de acesso</DialogTitle></DialogHeader>
            <div className="space-y-3 py-2">
              <Select value={clientId} onValueChange={setClientId}>
                <SelectTrigger><SelectValue placeholder="Selecione o cliente" /></SelectTrigger>
                <SelectContent>
                  {clients.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button className="w-full" onClick={() => create.mutate()} disabled={!clientId || create.isPending}>
                {create.isPending ? 'Gerando…' : 'Gerar'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {tokens.length === 0 ? (
        <Card><CardContent className="p-12 text-center">
          <LinkIcon className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <p className="text-sm text-muted-foreground">Nenhum link gerado ainda.</p>
        </CardContent></Card>
      ) : (
        <div className="space-y-3">
          {tokens.map((t: any) => {
            const url = buildUrl(t.token);
            return (
              <Card key={t.id}>
                <CardContent className="p-4 flex items-center gap-3 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{t.clients?.name || '—'}</p>
                      <Badge variant={t.active ? 'default' : 'outline'}>{t.active ? 'ativo' : 'inativo'}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground font-mono truncate mt-1">{url}</p>
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" onClick={() => { navigator.clipboard.writeText(url); toast({ title: 'Link copiado!' }); }} title="Copiar">
                      <Copy className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => window.open(url, '_blank')} title="Abrir">
                      <ExternalLink className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => toggle.mutate({ id: t.id, active: !t.active })}>
                      {t.active ? 'Desativar' : 'Ativar'}
                    </Button>
                    <Button variant="ghost" size="icon" className="text-destructive" onClick={() => remove.mutate(t.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
