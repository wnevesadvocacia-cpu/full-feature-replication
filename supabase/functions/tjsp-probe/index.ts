Deno.serve(async (req) => {
  const n = Number(new URL(req.url).searchParams.get("n") ?? 1);
  const res: string[] = [];
  for (let i = 0; i < n; i++) {
  const t0 = Date.now();
  let out: Record<string, unknown> = { region: Deno.env.get("SB_REGION") ?? null };
  const body = new URLSearchParams({
    "dadosConsulta.dtInicio": "05/11/2026",
    "dadosConsulta.dtFim": "06/11/2026",
    "dadosConsulta.cdCaderno": "-11",
    "dadosConsulta.pesquisaLivre": '"0000436-60.2026.8.26.0191"',
  });
  try {
    const r = await fetch("https://esaj.tjsp.jus.br/cdje/consultaAvancada.do", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
      signal: AbortSignal.timeout(20000),
    });
    const t = await r.text();
    out = { ...out, status: r.status, len: t.length, ms: Date.now() - t0 };
  } catch (e) {
    out = { ...out, error: (e as Error).message, ms: Date.now() - t0 };
  }
  res.push(String(out.status ?? out.error).slice(0, 40)); await new Promise((r) => setTimeout(r, 200));
  }
  return new Response(JSON.stringify({ region: out.region, res }), { headers: { "Content-Type": "application/json" } });
});
