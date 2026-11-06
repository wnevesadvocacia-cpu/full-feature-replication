Deno.serve(async () => {
  const t0 = Date.now();
  let out: Record<string, unknown> = { region: Deno.env.get("SB_REGION") ?? null };
  try {
    const r = await fetch("https://esaj.tjsp.jus.br/cdje/index.do", { signal: AbortSignal.timeout(15000) });
    out = { ...out, status: r.status, ms: Date.now() - t0 };
    await r.body?.cancel();
  } catch (e) {
    out = { ...out, error: (e as Error).message, ms: Date.now() - t0 };
  }
  return new Response(JSON.stringify(out), { headers: { "Content-Type": "application/json" } });
});
