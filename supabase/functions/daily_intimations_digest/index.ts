// Edge Function: daily_intimations_digest
// Cron: 0 11 UTC = 8h BRT. Itera user_notification_prefs (digest enabled),
// busca novas (D-1 → hoje) e pendentes, renderiza HTML responsivo, envia via Resend,
// loga em email_digest_log.
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const RED = '#a10000';
const YELLOW_BG = '#fff3cd';
const YELLOW_HEADER = '#856404';

// Regex CNJ: NNNNNNN-DD.AAAA.J.TR.OOOO
const CNJ_RE = /\b\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}\b/;

function escapeHtml(s: string | null | undefined): string {
  if (!s) return '';
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function formatDateBR(d: Date): string {
  return d.toLocaleDateString('pt-BR', {
    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
    timeZone: 'America/Sao_Paulo',
  });
}

function formatDeadline(d: string | null): string {
  if (!d) return 'sem prazo identificado';
  const dt = new Date(d + 'T00:00:00');
  return dt.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function confidenceBadge(conf: number | null | undefined): string {
  const c = typeof conf === 'number' ? conf : 0;
  if (c >= 85) return `<span style="background:#d4edda;color:#155724;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:bold;">✓ ${c}%</span>`;
  if (c >= 70) return `<span style="background:#fff3cd;color:#856404;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:bold;">⚠ ${c}%</span>`;
  return `<span style="background:#f8d7da;color:#721c24;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:bold;">⚠ REVISE</span>`;
}

function renderCard(item: any, headerColor: string): string {
  const cnjMatch = (item.content || '').match(CNJ_RE);
  const cnj = cnjMatch ? cnjMatch[0] : (item.external_id || '—');
  const conf = item.confidence ?? item.classification_confidence ?? null;
  const court = escapeHtml(item.court || '—');
  const prazo = formatDeadline(item.deadline);
  const snippet = escapeHtml((item.content || '').slice(0, 240));

  return `
  <div style="border:1px solid #e5e5e5;border-radius:6px;margin:0 0 12px;overflow:hidden;">
    <div style="background:${headerColor};color:#fff;padding:8px 12px;font-size:12px;font-weight:bold;">
      ${escapeHtml(cnj)}
    </div>
    <div style="padding:12px;background:#fff;">
      <div style="color:#888;font-size:12px;margin-bottom:6px;">${court}</div>
      <div style="margin-bottom:8px;">${confidenceBadge(conf)} <span style="color:#444;font-size:12px;margin-left:8px;">Prazo: <b>${prazo}</b></span></div>
      <div style="color:#333;font-size:13px;line-height:1.4;">${snippet}${snippet.length >= 240 ? '…' : ''}</div>
    </div>
  </div>`;
}

function renderEmail(nome: string, novas: any[], pendentes: any[]): string {
  const today = new Date();
  const dataFmt = formatDateBR(today);
  const novasHtml = novas.map(i => renderCard(i, RED)).join('');
  const pendHtml = pendentes.map(i => renderCard(i, YELLOW_HEADER)).join('');

  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,Helvetica,sans-serif;color:#222;">
  <div style="max-width:700px;margin:0 auto;padding:20px;">
    <div style="background:${RED};color:#fff;padding:18px 20px;border-radius:6px 6px 0 0;">
      <h1 style="margin:0;font-size:20px;">WnevesBox — Resumo de Intimações</h1>
      <div style="font-size:13px;opacity:.9;margin-top:4px;">${dataFmt}</div>
    </div>
    <div style="background:#fff;padding:20px;border-radius:0 0 6px 6px;">
      <p style="margin:0 0 16px;font-size:14px;">Olá, <b>${escapeHtml(nome || '')}</b>. Segue o resumo das intimações:</p>

      ${novas.length > 0 ? `
      <h2 style="color:${RED};font-size:15px;margin:16px 0 10px;border-bottom:2px solid ${RED};padding-bottom:4px;">
        🆕 Novas intimações (últimas 24h) — ${novas.length}
      </h2>
      ${novasHtml}` : ''}

      ${pendentes.length > 0 ? `
      <h2 style="color:${YELLOW_HEADER};font-size:15px;margin:24px 0 10px;border-bottom:2px solid ${YELLOW_HEADER};padding-bottom:4px;">
        ⏳ Pendentes — ${pendentes.length}
      </h2>
      ${pendHtml}` : ''}

      <div style="margin-top:24px;padding-top:16px;border-top:1px solid #eee;font-size:12px;color:#888;text-align:center;">
        WnevesBox · Acesse <a href="https://wnevesbox.com/intimacoes" style="color:${RED};">wnevesbox.com/intimacoes</a>
      </div>
    </div>
  </div>
</body></html>`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: prefs, error: prefsErr } = await supabase
      .from('user_notification_prefs')
      .select('user_id, email, nome, daily_digest_enabled')
      .eq('daily_digest_enabled', true);

    if (prefsErr) throw prefsErr;

    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    const ontemISO = yesterday.toISOString().slice(0, 10);
    const hojeISO = today.toISOString().slice(0, 10);

    const results: any[] = [];

    for (const p of prefs || []) {
      try {
        const { data: novas } = await supabase
          .from('intimations')
          .select('*')
          .eq('user_id', p.user_id)
          .gte('received_at', ontemISO)
          .lte('received_at', hojeISO)
          .order('received_at', { ascending: false })
          .limit(20);

        const { data: pendentes } = await supabase
          .from('intimations')
          .select('*')
          .eq('user_id', p.user_id)
          .eq('status', 'pendente')
          .order('deadline', { ascending: true, nullsFirst: false })
          .limit(15);

        const novasArr = novas || [];
        const pendArr = pendentes || [];

        if (novasArr.length + pendArr.length === 0) {
          results.push({ user_id: p.user_id, skipped: true, reason: 'no_items' });
          continue;
        }

        const html = renderEmail(p.nome || '', novasArr, pendArr);
        const subject = `WnevesBox — Resumo diário — ${novasArr.length} novas / ${pendArr.length} pendentes`;

        const resendRes = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${RESEND_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: 'WnevesBox <intimacoes@wnevesbox.com>',
            to: [p.email],
            subject,
            html,
          }),
        });

        const resendJson = await resendRes.json().catch(() => ({}));
        const resend_id = resendJson?.id || null;
        const resend_error = resendRes.ok ? null : (resendJson?.message || `HTTP ${resendRes.status}`);

        await supabase.from('email_digest_log').insert({
          user_id: p.user_id,
          sent_at: new Date().toISOString(),
          novas_count: novasArr.length,
          pendentes_count: pendArr.length,
          resend_id,
          resend_error,
        });

        results.push({
          user_id: p.user_id, email: p.email,
          novas: novasArr.length, pendentes: pendArr.length,
          resend_id, resend_error,
        });
      } catch (userErr: any) {
        console.error('digest user error', p.user_id, userErr);
        results.push({ user_id: p.user_id, error: String(userErr?.message || userErr) });
      }
    }

    return new Response(JSON.stringify({ status: 'ok', count: results.length, results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    console.error('digest fatal', e);
    return new Response(JSON.stringify({ status: 'error', error: String(e?.message || e) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
