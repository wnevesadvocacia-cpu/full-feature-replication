// Relay interno: reenvia a consulta do DJE TJSP (eSAJ cdje) a partir de outra
// região de execução quando o IP de saída do sync-djen é recusado pelo eSAJ.
// Destino fixo (sem SSRF) e acesso restrito à chave de serviço.
const TARGET = "https://esaj.tjsp.jus.br/cdje/consultaAvancada.do";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

Deno.serve(async (req) => {
  const auth = req.headers.get("authorization") ?? "";
  if (req.method !== "POST" || !SERVICE_ROLE || auth !== `Bearer ${SERVICE_ROLE}`) {
    return new Response("forbidden", { status: 403 });
  }
  const body = await req.text();
  if (body.length > 4000) return new Response("payload too large", { status: 413 });
  try {
    const res = await fetch(TARGET, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "pt-BR,pt;q=0.9",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
      body,
      signal: AbortSignal.timeout(25_000),
    });
    const buf = await res.arrayBuffer();
    return new Response(buf, {
      status: 200,
      headers: { "Content-Type": "application/octet-stream", "x-upstream-status": String(res.status) },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 502,
      headers: { "Content-Type": "application/json" },
    });
  }
});
