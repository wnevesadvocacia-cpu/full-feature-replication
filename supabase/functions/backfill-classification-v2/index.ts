// PR3 — Backfill shadow.
// Reprocessa todas as intimações com o motor canônico (detectDeadline) e
// popula APENAS as colunas v2. Não toca em `deadline` ou `deadline_sugerido_inseguro`.
// Acesso restrito a admin via has_role().
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { detectDeadline } from '../_shared/legalDeadlines.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    // Auth: aceita (a) token admin via has_role OU (b) IMPORT_TOKEN compartilhado (operação one-shot).
    const authHeader = req.headers.get('Authorization') || '';
    const opsToken = req.headers.get('x-ops-token') || '';
    const importToken = Deno.env.get('IMPORT_TOKEN') || '';
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );
    let authorized = false;
    if (opsToken && importToken && opsToken === importToken) {
      authorized = true;
    } else if (authHeader.startsWith('Bearer ')) {
      const userClient = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_ANON_KEY')!,
        { global: { headers: { Authorization: authHeader } } }
      );
      const { data: claims } = await userClient.auth.getClaims(authHeader.replace('Bearer ', ''));
      if (claims?.claims?.sub) {
        const { data: isAdmin } = await admin.rpc('has_role', { _user_id: claims.claims.sub, _role: 'admin' });
        if (isAdmin) authorized = true;
      }
    }
    if (!authorized) return json({ error: 'Unauthorized' }, 401);

    const today = new Date().toISOString().slice(0, 10);
    const PAGE = 200;
    let from = 0;
    let processed = 0;
    let errors = 0;
    let withDeadline = 0;
    let withoutDeadline = 0;
    const triggerCounts: Record<string, number> = {};

    while (true) {
      const { data: rows, error } = await admin
        .from('intimations')
        .select('id, content, received_at')
        .order('id', { ascending: true })
        .range(from, from + PAGE - 1);
      if (error) return json({ error: error.message, processed }, 500);
      if (!rows || rows.length === 0) break;

      for (const r of rows) {
        try {
          const detected = detectDeadline(r.content || '', r.received_at, today);
          const isSafe = !!detected && detected.classificacaoStatus === 'auto_alta' && !!detected.dueDate;
          const deadlineV2 = isSafe ? detected!.dueDate : null;
          const meta = detected ? {
            status: detected.classificacaoStatus,
            triggerSource: detected.triggerSource ?? null,
            days: detected.days ?? null,
            unit: detected.unit ?? null,
            label: detected.label ?? null,
            confianca: detected.confianca ?? null,
            peca: detected.pecaSugerida ?? null,
            base_legal: detected.baseLegal ?? null,
            due_date: detected.dueDate ?? null,
            start_date: detected.startDate ?? null,
            matched: (detected as any).matchedText ?? null,
            doubled: (detected as any).doubled ?? null,
            calculated_at: new Date().toISOString(),
          } : { status: null, triggerSource: 'none', confianca: 0 };

          const ts = (meta as any).triggerSource || 'none';
          triggerCounts[ts] = (triggerCounts[ts] || 0) + 1;
          if (deadlineV2) withDeadline++; else withoutDeadline++;

          const { error: updErr } = await admin
            .from('intimations')
            .update({ deadline_canonical_v2: deadlineV2, classification_canonical_v2: meta })
            .eq('id', r.id);
          if (updErr) { errors++; console.error('upd', r.id, updErr.message); }
          processed++;
        } catch (e: any) {
          errors++;
          console.error('row', r.id, e?.message || e);
        }
      }
      if (rows.length < PAGE) break;
      from += PAGE;
    }

    return json({
      ok: true,
      processed,
      errors,
      with_deadline_v2: withDeadline,
      without_deadline_v2: withoutDeadline,
      trigger_counts: triggerCounts,
    });
  } catch (e: any) {
    return json({ error: e?.message || String(e) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
