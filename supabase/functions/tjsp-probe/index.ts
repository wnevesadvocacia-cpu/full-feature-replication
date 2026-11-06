Deno.serve(async () => {
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
  return new Response(JSON.stringify(out), { headers: { "Content-Type": "application/json" } });
});
