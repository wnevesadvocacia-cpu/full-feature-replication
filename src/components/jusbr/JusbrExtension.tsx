import { useEffect, useRef, useState } from 'react';
import { Download, Link, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';

export function JusbrExtension() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [notice, setNotice] = useState('v0.3.2 · fila e retomada disponíveis. Adaptador de pesquisa disponível; avanço e fim da interface confirmados pelo titular; vazio e extensão instalada ainda exigem validação real.');
  const paired = useRef<string | null>(null);
  const { data: batches = [], error: batchesError } = useQuery({
    queryKey: ['jusbr-batches', user?.id], enabled: !!user,
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase.from('jusbr_batches').select('id,status,coverage,inserted,pending,error,created_at')
        .eq('user_id', user.id).order('created_at', { ascending: false }).limit(10);
      if (error) throw error;
      return data || [];
    }, refetchInterval: 60000,
  });

  useEffect(() => {
    paired.current = null;
    if (!user) return;
    let active = true;
    const restore = async () => {
      const { data, error } = await supabase.auth.getUser();
      if (!active || error || data.user?.id !== user.id) return;
      const { data: settings } = await supabase.from('oab_settings').select('oab_number,oab_uf').eq('user_id', user.id).eq('active', true);
      if (active) window.postMessage({ type: 'WNEVES_JUSBR_RESTORE', owner: user.id, settings: settings || [] }, window.location.origin);
    };
    const listener = async (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== window) return;
      const m = event.data;
      if (m?.type === 'WNEVES_JUSBR_PAIRED') {
        if (m.ok && m.owner === user.id) {
          paired.current = user.id;
          setNotice('Vínculo restaurado. Retentativas automáticas com Intimações aberta. Pesquisa pelos controles observados; avanço e fim da interface confirmados pelo titular; vazio e importação ponta a ponta pendentes.');
        } else if (m.message) setNotice(m.message);
        return;
      }
      if (m?.type !== 'WNEVES_JUSBR_CHECK' || typeof m.requestId !== 'string' || m.requestId.length > 50) return;
      const respond = (result: Record<string, unknown>) => window.postMessage({ type: 'WNEVES_JUSBR_RESULT', requestId: m.requestId, ...result }, window.location.origin);
      if (paired.current !== user.id || m.owner !== user.id || !m.batch) {
        respond({ ok: false, message: 'Conta/vínculo indisponível. Lote preservado.' }); return;
      }
      try {
        const { data: identity, error: identityError } = await supabase.auth.getUser();
        if (identityError || identity.user?.id !== user.id) throw Error('Sessão WnevesBox expirada ou conta alterada.');
        const { data, error } = await supabase.functions.invoke('jusbr-ingest', { body: { id: m.batch.id, rows: m.batch.rows, coverage: m.batch.coverage } });
        if (error) throw error;
        if (!data?.ok || !data.persisted) throw Error(data?.error || 'Servidor não confirmou a gravação.');
        if (!active) { respond({ ok: false, message: 'Conta/tela alterada; retomada necessária.' }); return; }
        setNotice(data.message);
        respond(data);
        await qc.invalidateQueries({ queryKey: ['jusbr-batches', user.id] });
        if (data.done) {
          await qc.invalidateQueries({ queryKey: ['intimations'] });
          toast({ title: 'Conferência Jus.br — cobertura incompleta', description: data.message });
        }
      } catch (error) {
        const message = `Conferência incompleta: ${error instanceof Error ? error.message : 'Falha de envio'}. Retentativa automática; importações preservadas.`;
        if (active) setNotice(message);
        respond({ ok: false, message });
      }
    };
    window.addEventListener('message', listener);
    // Content scripts are present before mount; retry restoration also handles delayed hydration.
    void restore();
    const timer = window.setTimeout(() => { void restore(); }, 1500);
    return () => { active = false; window.clearTimeout(timer); window.removeEventListener('message', listener); };
  }, [user?.id, qc, toast]);

  const download = async () => {
    try {
      const response = await fetch('/wnevesbox-jusbr.zip');
      if (!response.ok) throw Error('Download indisponível.');
      const url = URL.createObjectURL(await response.blob());
      const a = document.createElement('a');
      a.href = url; a.download = 'wnevesbox-jusbr-0.3.2.zip'; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch { setNotice('Não foi possível baixar a extensão. Tente novamente.'); }
  };
  const pair = async () => {
    if (!user) return;
    const { data: identity, error } = await supabase.auth.getUser();
    if (error || identity.user?.id !== user.id) { setNotice('Entre novamente na conta correta.'); return; }
    const { data: settings } = await supabase.from('oab_settings').select('oab_number,oab_uf').eq('user_id', user.id).eq('active', true);
    setNotice('Aguardando vínculo. Instale v0.3.2 e recarregue esta página e a Central Jus.br.');
    window.postMessage({ type: 'WNEVES_JUSBR_PAIR', owner: user.id, settings: settings || [] }, window.location.origin);
  };
  return <div className="space-y-2 border-t border-warning/30 pt-3">
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" onClick={download}><Download className="h-4 w-4 mr-1" />Baixar extensão v0.3.2</Button>
      <Button variant="outline" onClick={pair} disabled={!user}><Link className="h-4 w-4 mr-1" />Vincular uma vez</Button>
    </div>
    <details className="text-sm text-muted-foreground"><summary className="cursor-pointer">Instalação e validação</summary>
      <ol className="list-decimal pl-5 space-y-1 mt-2">
        <li>Descompacte; em chrome://extensions ou edge://extensions, ative Modo do desenvolvedor e Carregar sem compactação. Para atualizar, substitua os arquivos da pasta e clique Recarregar.</li>
        <li>Recarregue Intimações e a Central Jus.br; vincule uma vez na sua conta. Mantenha ambas abertas.</li>
        <li>Faça login com seu token exclusivamente no portal. Abra Minhas comunicações processuais → Diário da Justiça.</li>
        <li>A extensão pesquisa a OAB cadastrada e percorre páginas verificando o contador. Usa Data inicial/Data final; resposta obsoleta ou sem transição comprovável interrompe e alerta.</li>
        <li>Não abra Domicílio nem ações de ciência para testar. Avanço e fim da interface confirmados pelo titular. Preenchimento aceito pelo portal, carregamento/conclusão, estado vazio e persistência/importação com extensão instalada ainda precisam de validação; ausência de tela não confirma sessão expirada.</li>
      </ol>
    </details>
    <p role="status" aria-live="polite" className="text-sm font-medium text-foreground flex gap-2"><AlertTriangle className="h-4 w-4 text-warning shrink-0 mt-0.5" />{notice}</p>
    {batchesError && <p className="text-sm text-destructive">Histórico indisponível; não considere a conferência concluída.</p>}
    {!!batches.length && <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b"><th className="text-left p-2">Conferência</th><th className="text-left p-2">Telas observadas</th><th className="text-left p-2">Importações DJEN</th><th className="text-left p-2">Identidades pendentes</th><th className="text-left p-2">Cobertura</th></tr></thead>
      <tbody>{batches.map(batch => <tr key={batch.id} className="border-b"><td className="p-2 whitespace-nowrap">{new Date(batch.created_at).toLocaleString('pt-BR')}</td><td className="p-2">{Number((batch.coverage as { page?: number })?.page || 0)}</td><td className="p-2">{batch.inserted}</td><td className="p-2">{batch.pending}</td><td className="p-2 min-w-[220px]">{batch.status === 'running' || batch.status === 'starting' || batch.status === 'queued' ? 'Em processamento' : 'Incompleta'} · {batch.error || 'Aguardando conclusão persistida'}</td></tr>)}</tbody>
    </table></div>}
  </div>;
}
