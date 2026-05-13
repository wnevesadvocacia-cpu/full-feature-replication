// Edge one-shot: aplica retroativamente a regra de auto-link de intimações em
// fase de execução / cumprimento de sentença. Para cada intimação sem
// process_id (ou com fase não classificada), parseia o conteúdo procurando
// "Processo principal NNNN", "Cumprimento de sentença (NNNN)", etc. Se achar
// processo cadastrado pelo user com esse CNJ, vincula e grava classification_meta.
//
// Segurança: requer header x-admin-token com IMPORT_TOKEN (mesma chave de outras
// rotinas administrativas). NÃO sobrescreve process_id já vinculado.
//
// Uso:
//   curl -X POST <URL>/functions/v1/backfill-link-execucao \
//        -H "x-admin-token: $IMPORT_TOKEN" \
//        -H "content-type: application/json" \
//        -d '{"dry_run": true, "limit": 1000}'

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-admin-token',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function extractParentProcess(content: string, currentNumero: string | null): string | null {
  if (!content) return null;
  const text = content.replace(/\s+/g, ' ');
  const patterns: RegExp[] = [
    /processo\s+principal[:\s]*?(\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4})/i,
    /cumprimento\s+de\s+senten[çc]a[^()]*\((\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4})\)/i,
    /(?:origin[áa]rio|vinculad[oa]|derivad[oa])\s+(?:de|do|ao)?\s*(?:processo)?\s*n?[ºo]?\s*(\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4})/i,
    /execu[çc][ãa]o\s+(?:de\s+senten[çc]a)?\s*(?:nos\s+autos|do\s+processo)\s*n?[ºo]?\s*(\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4})/i,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m && m[1] && m[1] !== currentNumero) return m[1];
  }
  const all = Array.from(new Set((text.match(/\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}/g) || []).filter((n) => n !== currentNumero)));
  if (all.length === 1 && currentNumero) return all[0];
  return null;
}

function detectsExecutionPhase(content: string): boolean {
  if (!content) return false;
  return /cumprimento\s+de\s+senten[çc]a|execu[çc][ãa]o\s+de\s+(senten[çc]a|t[íi]tulo)|fase\s+de\s+execu[çc][ãa]o/i.test(content);
}

// Extrai CNJ do "cabeçalho" da intimação (campo court não tem; usa primeira ocorrência no content)
function firstCnj(content: string): string | null {
  const m = content?.match(/\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}/);
  return m ? m[0] : null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const adminToken = req.headers.get('x-admin-token');
  if (!adminToken || adminToken !== Deno.env.get('IMPORT_TOKEN')) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const body = await req.json().catch(() => ({}));
  const dryRun = body.dry_run !== false; // default: dry-run
  const limit = Math.min(Number(body.limit) || 5000, 10000);

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // Busca intimações candidatas: sem fase classificada
  const { data: intims, error: fetchErr } = await supabase
    .from('intimations')
    .select('id, user_id, content, process_id, classification_meta')
    .or('classification_meta.is.null,classification_meta->>fase.is.null')
    .limit(limit);

  if (fetchErr) {
    return new Response(JSON.stringify({ error: fetchErr.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Cache de processos por (user_id + cnj) para evitar N queries
  const procCache = new Map<string, string | null>(); // key=`${user_id}:${cnj}`
  async function lookupProcess(userId: string, cnj: string): Promise<string | null> {
    const key = `${userId}:${cnj}`;
    if (procCache.has(key)) return procCache.get(key)!;
    const { data } = await supabase.from('processes').select('id').eq('user_id', userId).eq('number', cnj).maybeSingle();
    const id = data?.id ?? null;
    procCache.set(key, id);
    return id;
  }

  let scanned = 0, matchedExecutionOnly = 0, linkedToParent = 0, updates: any[] = [];

  for (const it of intims || []) {
    scanned++;
    const cnjHeader = firstCnj(it.content);
    const parentNumero = extractParentProcess(it.content, cnjHeader);
    const isExecution = detectsExecutionPhase(it.content);

    if (!parentNumero && !isExecution) continue;

    let newProcessId = it.process_id;
    let didLink = false;
    if (!newProcessId && parentNumero) {
      const parentId = await lookupProcess(it.user_id, parentNumero);
      if (parentId) { newProcessId = parentId; didLink = true; linkedToParent++; }
    }
    if (!didLink && isExecution) matchedExecutionOnly++;

    const meta = {
      fase: isExecution ? 'execucao' : (it.classification_meta as any)?.fase ?? null,
      numero_execucao: didLink ? cnjHeader : (it.classification_meta as any)?.numero_execucao ?? null,
      processo_principal: parentNumero,
      linked_to_parent: didLink || !!(it.classification_meta as any)?.linked_to_parent,
      backfilled_at: new Date().toISOString(),
    };

    const update: any = { id: it.id, classification_meta: meta };
    if (didLink) update.process_id = newProcessId;
    updates.push(update);
  }

  if (dryRun) {
    return new Response(JSON.stringify({
      dry_run: true, scanned, candidates: updates.length,
      linked_to_parent: linkedToParent, marked_execution_only: matchedExecutionOnly,
      sample: updates.slice(0, 10),
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  // Aplicar (em lotes de 100)
  let applied = 0, errors: string[] = [];
  for (let i = 0; i < updates.length; i += 100) {
    const batch = updates.slice(i, i + 100);
    for (const u of batch) {
      const { id, ...rest } = u;
      const { error } = await supabase.from('intimations').update(rest).eq('id', id);
      if (error) errors.push(`${id}: ${error.message}`);
      else applied++;
    }
  }

  return new Response(JSON.stringify({
    dry_run: false, scanned, applied, linked_to_parent: linkedToParent,
    marked_execution_only: matchedExecutionOnly, errors: errors.slice(0, 20), error_count: errors.length,
  }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
});
