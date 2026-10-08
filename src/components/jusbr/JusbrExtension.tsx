import { useEffect, useRef, useState } from 'react';
import { Download, Link, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { readJusbrRows, unmatchedJusbrRows, type JusbrRow } from '@/lib/jusbrCheck';
import { runDjenSync } from '@/lib/runDjenSync';

export function JusbrExtension() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [notice, setNotice] = useState('Validação no portal autenticado pendente. A extensão lê somente linhas exibidas; não executa busca ou paginação no Jus.br.');
  const paired = useRef<string | null>(null);
  const busy = useRef(false);
  const pairing = useRef(false);

  useEffect(() => {
    paired.current = null;
    pairing.current = false;
    const listener = async (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== window) return;
      const m = event.data;
      if (m?.type === 'WNEVES_JUSBR_PAIRED' && pairing.current && m.ok && m.owner === user?.id) {
        pairing.current = false;
        paired.current = m.owner;
        setNotice('Extensão vinculada. Entre no Jus.br → Minhas comunicações processuais → Diário da Justiça. As linhas exibidas serão conferidas; mantenha esta página aberta.');
        return;
      }
      if (m?.type !== 'WNEVES_JUSBR_CHECK' || typeof m.requestId !== 'string' || m.requestId.length > 50) return;
      const respond = (ok: boolean, message: string) => window.postMessage({ type: 'WNEVES_JUSBR_RESULT', requestId: m.requestId, ok, message }, window.location.origin);
      if (!user || paired.current !== user.id || m.owner !== user.id || busy.current) {
        respond(false, 'Vínculo indisponível ou conferência em andamento. Vincule novamente na conta correta.');
        return;
      }
      busy.current = true;
      try {
        const { data: identity, error: identityError } = await supabase.auth.getUser();
        if (identityError || identity.user?.id !== user.id) throw new Error('Sessão alterada. Entre e vincule novamente.');
        const rows = readJusbrRows(m.rows);
        const readRecords = async () => {
          const dates = rows.map(row => row.date).sort();
          const { data, error } = await supabase.from('intimations').select('user_id,content,received_at,court')
            .eq('user_id', user.id).gte('received_at', dates[0]).lte('received_at', `${dates[dates.length - 1]}T23:59:59.999Z`).limit(2001);
          if (error) throw error;
          if (!data || data.length > 2000) throw new Error('Limite de leitura atingido; conferência incompleta.');
          return data;
        };
        let missing: JusbrRow[] = unmatchedJusbrRows(rows, await readRecords(), user.id);
        let inserted = 0;
        if (missing.length) {
          setNotice(`${missing.length} linhas sem correspondência. Recuperação DJEN em andamento; não considere concluída.`);
          const dates = missing.map(row => row.date).sort();
          const result = await runDjenSync({ date_start: dates[0], date_end: dates[dates.length - 1], bypass_name_filter: true });
          inserted = result.inserted;
          missing = unmatchedJusbrRows(rows, await readRecords(), user.id);
          await qc.invalidateQueries({ queryKey: ['intimations'] });
        }
        const message = `${rows.length} linhas visíveis conferidas; ${inserted} publicações recuperadas pelo DJEN; ${missing.length} sem correspondência. Cobertura incompleta: linhas não identificam o ato integral, outras páginas e Domicílio não foram lidos. Confira o portal.`;
        const { error: notifyError } = await supabase.from('notifications').insert({ user_id: user.id, title: 'Conferência complementar Jus.br — atenção', message, type: 'warning', link: '/intimacoes' });
        if (notifyError) throw new Error('Conferência efetuada, mas alerta não gravado. Confira o portal.');
        setNotice(message);
        toast({ title: 'Conferência complementar — atenção', description: message });
        respond(true, message);
      } catch (error) {
        const message = `Conferência incompleta: ${error instanceof Error ? error.message : 'Falha de leitura'}. Publicações importadas preservadas; confira o Jus.br.`;
        setNotice(message);
        toast({ title: 'Conferência incompleta', description: message, variant: 'destructive' });
        await supabase.from('notifications').insert({ user_id: user.id, title: 'Conferência Jus.br incompleta', message, type: 'warning', link: '/intimacoes' });
        respond(false, message);
      } finally { busy.current = false; }
    };
    window.addEventListener('message', listener);
    return () => window.removeEventListener('message', listener);
  }, [user?.id, qc, toast]);

  const download = async () => {
    try {
      const response = await fetch('/wnevesbox-jusbr.zip');
      if (!response.ok) throw new Error('Download indisponível.');
      const url = URL.createObjectURL(await response.blob());
      const a = document.createElement('a');
      a.href = url; a.download = 'wnevesbox-jusbr.zip'; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch { setNotice('Não foi possível baixar a extensão. Tente novamente.'); }
  };

  const pair = () => {
    if (!user) return;
    pairing.current = true;
    setNotice('Aguardando a extensão. Se não vincular, instale e recarregue esta página.');
    window.postMessage({ type: 'WNEVES_JUSBR_PAIR', owner: user.id }, window.location.origin);
  };

  return <div className="space-y-2 border-t border-warning/30 pt-3">
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" onClick={download}><Download className="h-4 w-4 mr-1" />Baixar extensão Chrome/Edge</Button>
      <Button variant="outline" onClick={pair} disabled={!user}><Link className="h-4 w-4 mr-1" />Vincular extensão</Button>
    </div>
    <details className="text-sm text-muted-foreground"><summary className="cursor-pointer">Instalação — uma vez</summary>
      <ol className="list-decimal pl-5 space-y-1 mt-2"><li>Baixe e descompacte o arquivo.</li><li>Abra chrome://extensions (Edge: edge://extensions) e ative “Modo do desenvolvedor”.</li><li>Clique “Carregar sem compactação” e selecione a pasta descompactada.</li><li>Recarregue esta página e a Central do Jus.br; clique “Vincular extensão”.</li></ol>
    </details>
    <p role="status" aria-live="polite" className="text-sm font-medium text-foreground flex gap-2"><AlertTriangle className="h-4 w-4 text-warning shrink-0 mt-0.5" />{notice}</p>
  </div>;
}