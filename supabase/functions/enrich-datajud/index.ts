// Enriquecimento via DataJud/CNJ.
// Para intimações com numero_processo (no content) mas sem process_id,
// busca dados no DataJud público (por nº CNJ) e cria/atualiza o processo local + vincula.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const DATAJUD_API_KEY = Deno.env.get("DATAJUD_API_KEY")!;

// Mapa mínimo sigla → alias DataJud. Acrescente conforme uso real.
const ALIAS: Record<string, string> = {
  TJSP: "api_publica_tjsp", TJMG: "api_publica_tjmg", TJGO: "api_publica_tjgo",
  TJRJ: "api_publica_tjrj", TJRS: "api_publica_tjrs", TJPR: "api_publica_tjpr",
  TJSC: "api_publica_tjsc", TJBA: "api_publica_tjba", TJDF: "api_publica_tjdft",
  TJDFT: "api_publica_tjdft", TJES: "api_publica_tjes", TJPE: "api_publica_tjpe",
  TJCE: "api_publica_tjce", TJPB: "api_publica_tjpb", TJRN: "api_publica_tjrn",
  TJSE: "api_publica_tjse", TJAL: "api_publica_tjal", TJPI: "api_publica_tjpi",
  TJMA: "api_publica_tjma", TJPA: "api_publica_tjpa", TJAM: "api_publica_tjam",
  TJTO: "api_publica_tjto", TJMT: "api_publica_tjmt", TJMS: "api_publica_tjms",
  TJRO: "api_publica_tjro", TJAC: "api_publica_tjac", TJRR: "api_publica_tjrr",
  TJAP: "api_publica_tjap", TST: "api_publica_tst",
  TRF1: "api_publica_trf1", TRF2: "api_publica_trf2", TRF3: "api_publica_trf3",
  TRF4: "api_publica_trf4", TRF5: "api_publica_trf5", TRF6: "api_publica_trf6",
};

const CNJ_RE = /\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}/;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-admin-token",
};

function aliasFromCourt(court: string | null | undefined): string | null {
  if (!court) return null;
  const sig = court.split(/[\s-]/)[0].toUpperCase();
  return ALIAS[sig] || null;
}

async function queryDataJud(alias: string, numero: string) {
  const url = `https://api-publica.datajud.cnj.jus.br/${alias}/_search`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Authorization": `APIKey ${DATAJUD_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: { match: { numeroProcesso: numero.replace(/\D/g, "") } }, size: 1 }),
  });
  if (!res.ok) return null;
  const j = await res.json().catch(() => null);
  const hit = j?.hits?.hits?.[0]?._source;
  return hit || null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const adminToken = req.headers.get("x-admin-token");
  if (!adminToken || adminToken !== Deno.env.get("IMPORT_TOKEN")) {
    return new Response(JSON.stringify({ ok: false, error: "unauthorized" }), {
      status: 401, headers: { ...cors, "Content-Type": "application/json" },
    });
  }
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const body = await req.json().catch(() => ({}));
    const limit = Math.min(Number(body?.limit) || 50, 200);
    const userIdFilter: string | null = body?.user_id || null;

    let q = supabase.from("intimations")
      .select("id, user_id, court, content")
      .is("process_id", null)
      .limit(limit);
    if (userIdFilter) q = q.eq("user_id", userIdFilter);
    const { data: intims, error } = await q;
    if (error) throw error;

    let enriched = 0, linked = 0, skipped = 0;
    for (const it of intims || []) {
      const m = (it.content || "").match(CNJ_RE);
      if (!m) { skipped++; continue; }
      const numero = m[0];
      const alias = aliasFromCourt(it.court);
      if (!alias) { skipped++; continue; }

      // Já existe processo local com esse número p/ esse user?
      const { data: existing } = await supabase.from("processes")
        .select("id").eq("user_id", it.user_id).eq("number", numero).maybeSingle();

      let processId: string | null = existing?.id ?? null;

      if (!processId) {
        const hit = await queryDataJud(alias, numero);
        if (!hit) { skipped++; continue; }
        const title = hit?.classe?.nome || hit?.assuntos?.[0]?.nome || `Processo ${numero}`;
        const tribunal = hit?.tribunal || it.court?.split(/[\s-]/)[0] || null;
        const vara = hit?.orgaoJulgador?.nome || null;
        const ins = await supabase.from("processes").insert({
          user_id: it.user_id,
          number: numero,
          title,
          tribunal,
          vara,
          type: hit?.classe?.nome || null,
          last_update: hit?.dataHoraUltimaAtualizacao ? hit.dataHoraUltimaAtualizacao.slice(0, 10) : null,
          status: 'novo',
        }).select("id").single();
        if (ins.error) { skipped++; continue; }
        processId = ins.data.id;
        enriched++;
      }

      const upd = await supabase.from("intimations").update({ process_id: processId }).eq("id", it.id);
      if (!upd.error) linked++;
    }

    return new Response(JSON.stringify({ ok: true, scanned: intims?.length || 0, enriched, linked, skipped }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ ok: false, error: e.message }), {
      status: 500, headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
