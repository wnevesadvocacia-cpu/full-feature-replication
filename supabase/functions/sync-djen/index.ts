// Sincroniza intimações do DJEN (Diário de Justiça Eletrônico Nacional - CNJ)
// API pública gratuita: https://comunicaapi.pje.jus.br/api/v1/comunicacao
//
// SISTEMA À PROVA DE FALHAS — camadas de proteção:
// 1. Retry com backoff exponencial (3 tentativas) em cada chamada à API CNJ
// 2. Timeout de 30s por requisição (evita travamento)
// 3. Janela de busca redundante (45 dias) para nunca perder publicação por gap de cron
// 4. Log persistente de cada execução (tabela sync_logs)
// 5. Contagem de falhas consecutivas → notificação crítica ao usuário em ≥2 falhas
// 6. Falha em uma OAB NÃO interrompe sincronização das outras
// 7. Notificação destructive quando intimação tem prazo ≤ 5 dias
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface DjenItem {
  id?: number | string;
  hash?: string;
  numero_processo?: string;
  texto?: string;
  data_disponibilizacao?: string;
  siglaTribunal?: string;
  nomeOrgao?: string;
  tipoComunicacao?: string;
  prazo?: string;
}

const REQUEST_TIMEOUT_MS = 30_000;
const MAX_RETRIES = 3;
const DAYS_BACK = 45; // janela ampla = redundância contra qualquer gap de cron

async function fetchWithRetry(url: string, attempt = 1): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers: { Accept: 'application/json' }, signal: controller.signal });
    clearTimeout(timer);
    // Retry em 5xx ou 429 (rate limit)
    if ((res.status >= 500 || res.status === 429) && attempt < MAX_RETRIES) {
      const wait = 2 ** attempt * 1000 + Math.random() * 500;
      console.warn(`DJEN ${res.status} — tentativa ${attempt}/${MAX_RETRIES}, aguardando ${Math.round(wait)}ms`);
      await new Promise(r => setTimeout(r, wait));
      return fetchWithRetry(url, attempt + 1);
    }
    return res;
  } catch (e: any) {
    clearTimeout(timer);
    if (attempt < MAX_RETRIES) {
      const wait = 2 ** attempt * 1000 + Math.random() * 500;
      console.warn(`DJEN fetch erro (${e.message}) — tentativa ${attempt}/${MAX_RETRIES}, aguardando ${Math.round(wait)}ms`);
      await new Promise(r => setTimeout(r, wait));
      return fetchWithRetry(url, attempt + 1);
    }
    throw e;
  }
}

async function fetchDjen(oab: string, uf: string): Promise<{ items: DjenItem[]; attempts: number }> {
  const dataInicio = new Date(Date.now() - DAYS_BACK * 86400_000).toISOString().slice(0, 10);
  const dataFim = new Date().toISOString().slice(0, 10);
  const all: DjenItem[] = [];
  let pagina = 1;
  let totalAttempts = 0;
  while (pagina <= 20) {
    const url = `https://comunicaapi.pje.jus.br/api/v1/comunicacao?numeroOab=${encodeURIComponent(oab)}&ufOab=${encodeURIComponent(uf)}&dataDisponibilizacaoInicio=${dataInicio}&dataDisponibilizacaoFim=${dataFim}&pagina=${pagina}&itensPorPagina=100`;
    const res = await fetchWithRetry(url);
    totalAttempts++;
    if (!res.ok) {
      const t = await res.text();
      throw new Error(`DJEN ${res.status} (pag ${pagina}): ${t.slice(0, 200)}`);
    }
    const json = await res.json();
    const items: DjenItem[] = json.items || json.data || [];
    if (!items.length) break;
    all.push(...items);
    if (items.length < 100) break;
    pagina++;
  }
  return { items: all, attempts: totalAttempts };
}

function cleanHtml(raw: string): string {
  if (!raw) return '';
  return raw
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function extractDeadline(text: string, receivedAt: string): string | null {
  const match = text.match(/prazo[\s\S]{0,30}?(\d{1,3})\s*dias/i);
  if (!match) return null;
  const days = parseInt(match[1], 10);
  if (!days || days > 365) return null;
  const base = new Date(receivedAt);
  base.setDate(base.getDate() + days);
  return base.toISOString().slice(0, 10);
}

function daysUntil(iso: string): number {
  const target = new Date(iso + 'T12:00:00Z').getTime();
  return Math.ceil((target - Date.now()) / 86400_000);
}

async function findProcessId(supabase: any, userId: string, numero?: string): Promise<string | null> {
  if (!numero) return null;
  const { data } = await supabase.from('processes').select('id').eq('user_id', userId).eq('number', numero).limit(1).maybeSingle();
  return data?.id || null;
}

async function syncForOab(supabase: any, row: any, triggeredBy: string) {
  const startedAt = Date.now();
  let items: DjenItem[] = [];
  let attempts = 0;
  let inserted = 0;
  let urgentDeadlines = 0;
  let errorMessage: string | null = null;
  let status: 'success' | 'partial' | 'failed' = 'success';

  try {
    const result = await fetchDjen(row.oab_number, row.oab_uf);
    items = result.items;
    attempts = result.attempts;
  } catch (e: any) {
    errorMessage = e.message || String(e);
    status = 'failed';
  }

  if (status !== 'failed') {
    for (const it of items) {
      try {
        const externalId = String(it.hash || it.id || `${it.numero_processo}-${it.data_disponibilizacao}`);
        const cleanText = cleanHtml(it.texto || it.tipoComunicacao || 'Sem conteúdo');
        const receivedAt = it.data_disponibilizacao || new Date().toISOString().slice(0, 10);
        const deadline = extractDeadline(cleanText, receivedAt);
        const processId = await findProcessId(supabase, row.user_id, it.numero_processo);
        const { error } = await supabase.from('intimations').insert({
          user_id: row.user_id,
          external_id: externalId,
          source: 'djen',
          court: it.siglaTribunal ? `${it.siglaTribunal}${it.nomeOrgao ? ' - ' + it.nomeOrgao : ''}` : it.nomeOrgao,
          content: cleanText,
          received_at: receivedAt,
          deadline,
          process_id: processId,
          status: 'pendente',
        });
        if (!error) {
          inserted++;
          // URGENTE se prazo ≤ 5 dias úteis
          const isUrgent = deadline && daysUntil(deadline) <= 5;
          if (isUrgent) urgentDeadlines++;
          await supabase.from('notifications').insert({
            user_id: row.user_id,
            title: isUrgent ? '⚠️ Intimação URGENTE' : 'Nova intimação DJEN',
            message: `OAB/${row.oab_uf} ${row.oab_number} — ${it.siglaTribunal || 'Tribunal'} - ${it.numero_processo || 'Processo'}${deadline ? ` (prazo: ${deadline})` : ''}`,
            type: isUrgent ? 'destructive' : 'warning',
            link: '/intimacoes',
          });
        } else if (error.code !== '23505') {
          // 23505 = duplicata (esperado). Outros erros = parcial.
          console.error('insert intimation error:', error);
          status = 'partial';
        }
      } catch (itemErr: any) {
        console.error('item processing error:', itemErr);
        status = 'partial';
      }
    }
  }

  const duration = Date.now() - startedAt;
  const now = new Date().toISOString();

  // Atualiza oab_settings com tracking de falhas
  if (status === 'failed') {
    await supabase.from('oab_settings').update({
      last_sync_at: now,
      consecutive_failures: (row.consecutive_failures || 0) + 1,
      last_error: errorMessage?.slice(0, 500),
    }).eq('id', row.id);

    // Alerta crítico: ≥2 falhas consecutivas
    const failureCount = (row.consecutive_failures || 0) + 1;
    if (failureCount >= 2) {
      await supabase.from('notifications').insert({
        user_id: row.user_id,
        title: '🚨 Falha crítica na sincronização DJEN',
        message: `OAB/${row.oab_uf} ${row.oab_number} falhou ${failureCount}x consecutivas. Verifique imediatamente em Configurações → Intimações. Erro: ${errorMessage?.slice(0, 100)}`,
        type: 'destructive',
        link: '/configuracoes',
      });
    }
  } else {
    await supabase.from('oab_settings').update({
      last_sync_at: now,
      last_success_at: now,
      consecutive_failures: 0,
      last_error: null,
    }).eq('id', row.id);
  }

  // Log persistente
  await supabase.from('sync_logs').insert({
    user_id: row.user_id,
    oab_settings_id: row.id,
    oab_number: row.oab_number,
    oab_uf: row.oab_uf,
    status,
    attempts,
    items_found: items.length,
    items_inserted: inserted,
    duration_ms: duration,
    error_message: errorMessage?.slice(0, 1000),
    triggered_by: triggeredBy,
  });

  return {
    user_id: row.user_id,
    oab: `${row.oab_number}/${row.oab_uf}`,
    status,
    total: items.length,
    inserted,
    urgent: urgentDeadlines,
    attempts,
    duration_ms: duration,
    error: errorMessage,
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const url = new URL(req.url);
    const isManual = url.searchParams.get('manual') === '1';
    const authHeader = req.headers.get('Authorization');
    const triggeredBy = isManual ? 'manual' : 'cron';

    let targets: any[] = [];

    if (isManual && authHeader) {
      const userClient = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_ANON_KEY')!,
        { global: { headers: { Authorization: authHeader } } },
      );
      const { data: userData, error: userErr } = await userClient.auth.getUser();
      if (userErr || !userData?.user?.id) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      const { data } = await supabase.from('oab_settings').select('*').eq('user_id', userData.user.id).eq('active', true);
      targets = data || [];
    } else {
      const { data } = await supabase.from('oab_settings').select('*').eq('active', true);
      targets = data || [];
    }

    // Roda em paralelo (limitado a 5) para escalar com muitos usuários, sem que falha de uma derrube as outras
    const CONCURRENCY = 5;
    const results: any[] = [];
    for (let i = 0; i < targets.length; i += CONCURRENCY) {
      const batch = targets.slice(i, i + CONCURRENCY);
      const batchResults = await Promise.allSettled(batch.map(row => syncForOab(supabase, row, triggeredBy)));
      for (const r of batchResults) {
        if (r.status === 'fulfilled') results.push(r.value);
        else results.push({ status: 'failed', error: String(r.reason) });
      }
    }

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    console.error('sync-djen fatal:', e);
    return new Response(JSON.stringify({ success: false, error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
