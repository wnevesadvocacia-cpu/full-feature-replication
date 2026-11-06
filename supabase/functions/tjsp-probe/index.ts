const hex = (n: number) => Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => b.toString(16).padStart(2, "0")).join("");
Deno.serve(async (req) => {
  const fresh = new URL(req.url).searchParams.get("fresh") === "1";
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const body = new URLSearchParams({
    "dadosConsulta.dtInicio": "05/11/2026",
    "dadosConsulta.dtFim": "06/11/2026",
    "dadosConsulta.cdCaderno": "-11",
    "dadosConsulta.pesquisaLivre": '"0000436-60.2026.8.26.0191"',
  }).toString();
  const res: string[] = [];
  for (let i = 0; i < 12; i++) {
    const h: Record<string, string> = { Authorization: `Bearer ${key}`, apikey: key, "x-region": "sa-east-1" };
    if (fresh) h.traceparent = `00-${hex(16)}-${hex(8)}-01`;
    try {
      const r = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/tjsp-relay`, { method: "POST", headers: h, body });
      const t = await r.arrayBuffer();
      res.push(`${r.status}/${r.headers.get("x-upstream-status")}/${t.byteLength}${r.ok ? "" : ":" + new TextDecoder().decode(t).slice(0, 60)}`);
    } catch (e) {
      res.push((e as Error).message.slice(0, 60));
    }
  }
  return new Response(JSON.stringify(res));
});
