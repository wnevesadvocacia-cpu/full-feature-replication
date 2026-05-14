// Edge Function: daily_backup_intimations
// Cron: 0 6 UTC = 3h BRT. Exporta tabelas críticas em JSON gzipado para Supabase Storage.
// Bucket privado 'wnevesbox-backups'. Loga em backup_log. Try-catch por tabela.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { gzip } from 'https://deno.land/x/compress@v0.4.5/mod.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const BUCKET = 'wnevesbox-backups';
const TABLES = ['intimations', 'processes', 'process_comments', 'tasks', 'clients', 'oab_settings'];
const PAGE_SIZE = 1000;

async function exportTable(supabase: any, table: string): Promise<any[]> {
  const all: any[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .order('id', { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    const batch = data || [];
    all.push(...batch);
    if (batch.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return all;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const today = new Date().toISOString().slice(0, 10);
    const results: any[] = [];

    for (const table of TABLES) {
      try {
        const rows = await exportTable(supabase, table);
        const payload = JSON.stringify({
          table,
          exported_at: new Date().toISOString(),
          count: rows.length,
          rows,
        });
        const gz = gzip(new TextEncoder().encode(payload));
        const path = `daily/${today}/${table}.json.gz`;

        const blob = new Blob([gz], { type: 'application/gzip' });
        const { error: upErr } = await supabase.storage
          .from(BUCKET)
          .upload(path, blob, { contentType: 'application/gzip', upsert: true });

        if (upErr) {
          results.push({ table, rows: rows.length, gz_bytes: gz.length, status: 'failed', error: upErr.message });
        } else {
          results.push({ table, rows: rows.length, gz_bytes: gz.length, status: 'ok', path });
        }
      } catch (tableErr: any) {
        console.error('backup table error', table, tableErr);
        results.push({ table, status: 'failed', error: String(tableErr?.message || tableErr) });
      }
    }

    await supabase.from('backup_log').insert({
      run_at: new Date().toISOString(),
      date: today,
      results,
    });

    return new Response(JSON.stringify({ status: 'ok', date: today, results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    console.error('backup fatal', e);
    return new Response(JSON.stringify({ status: 'error', error: String(e?.message || e) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
