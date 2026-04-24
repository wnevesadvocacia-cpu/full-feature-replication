// Sincroniza intimações do DJEN (Diário de Justiça Eletrônico Nacional - CNJ)
// API pública gratuita: https://comunicaapi.pje.jus.br/api/v1/comunicacao
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

async function fetchDjen(oab: string, uf: string, daysBack = 30): Promise<DjenItem[]> {
  const dataInicio = new Date(Date.now() - daysBack * 86400_000).toISOString().slice(0, 10);
  const dataFim = new Date().toISOString().slice(0, 10);
  const all: DjenItem[] = [];
  let pagina = 1;
  while (pagina <= 10) {
    const url = `https://comunicaapi.pje.jus.br/api/v1/comunicacao?numeroOab=${encodeURIComponent(oab)}&ufOab=${encodeURIComponent(uf)}&dataDisponibilizacaoInicio=${dataInicio}&dataDisponibilizacaoFim=${dataFim}&pagina=${pagina}&itensPorPagina=100`;
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) {
      const t = await res.text();
      throw new Error(`DJEN ${res.status}: ${t.slice(0, 200)}`);
    }
    const json = await res.json();
    const items: DjenItem[] = json.items || json.data || [];
    if (!items.length) break;
    all.push(...items);
    if (items.length < 100) break;
    pagina++;
  }
  return all;
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
  // Procura "prazo de X dias" no texto
  const match = text.match(/prazo[\s\S]{0,30}?(\d{1,3})\s*dias/i);
  if (!match) return null;
  const days = parseInt(match[1], 10);
  if (!days || days > 365) return null;
  const base = new Date(receivedAt);
  base.setDate(base.getDate() + days);
  return base.toISOString().slice(0, 10);
}

async function findProcessId(supabase: any, userId: string, numero?: string): Promise<string | null> {
  if (!numero) return null;
  const { data } = await supabase.from('processes').select('id').eq('user_id', userId).eq('number', numero).limit(1).maybeSingle();
  return data?.id || null;
}

async function syncForUser(supabase: any, row: any) {
  const items = await fetchDjen(row.oab_number, row.oab_uf, 30);
  let inserted = 0;
  for (const it of items) {
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
      // Notificação para o usuário
      await supabase.from('notifications').insert({
        user_id: row.user_id,
        title: 'Nova intimação DJEN',
        message: `${it.siglaTribunal || 'Tribunal'} - ${it.numero_processo || 'Processo'}${deadline ? ` (prazo: ${deadline})` : ''}`,
        type: 'warning',
        link: '/intimacoes',
      });
    }
    // Erros de unique violation (23505) são ignorados — significa duplicata
  }
  await supabase.from('oab_settings').update({ last_sync_at: new Date().toISOString() }).eq('id', row.id);
  return { user_id: row.user_id, total: items.length, inserted };
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

    let targets: any[] = [];

    if (isManual && authHeader) {
      // Sincroniza só o usuário autenticado
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
      // Cron: todos ativos
      const { data } = await supabase.from('oab_settings').select('*').eq('active', true);
      targets = data || [];
    }

    const results = [];
    for (const row of targets) {
      try {
        results.push(await syncForUser(supabase, row));
      } catch (e: any) {
        results.push({ user_id: row.user_id, error: e.message });
      }
    }

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    console.error('sync-djen error', e);
    return new Response(JSON.stringify({ success: false, error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
