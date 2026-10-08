import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeadersFor, handleCorsPreflight, rejectIfDisallowedOrigin } from "../_shared/cors.ts";
import { validateObservations, validCoverage, targetedNumbers, ownerMatches } from "../_shared/jusbrBatch.ts";

Deno.serve(async (req) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;
  const rejected = rejectIfDisallowedOrigin(req);
  if (rejected) return rejected;
  const headers = { ...corsHeadersFor(req), "Content-Type": "application/json" };
  const respond = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  if (!url || !key || !anon) return respond({ error: "Configuração indisponível." }, 503);
  const auth = req.headers.get("Authorization") || "";
  const db = createClient(url, key);
  const { data: identity, error: authError } = await db.auth.getUser(auth.replace(/^Bearer\s+/i, ""));
  if (authError || !identity.user) return respond({ error: "Sessão WnevesBox expirada." }, 401);
  const owner = identity.user.id;
  try {
    const body = await req.json();
    if (body.resume === true) {
      const { data: running, error: runningError } = await db
        .from("jusbr_batches")
        .select("id")
        .eq("user_id", owner)
        .eq("status", "running")
        .order("created_at")
        .limit(1)
        .maybeSingle();
      if (runningError) throw runningError;
      let next = running;
      if (!next) {
        const { data: queued, error: queuedError } = await db
          .from("jusbr_batches")
          .select("id")
          .eq("user_id", owner)
          .eq("status", "queued")
          .or(`retry_after.is.null,retry_after.lte.${new Date().toISOString()}`)
          .order("created_at")
          .limit(1)
          .maybeSingle();
        if (queuedError) throw queuedError;
        next = queued;
      }
      if (!next) {
        const { data: failed, error: failedError } = await db
          .from("jusbr_batches")
          .select("id")
          .eq("user_id", owner)
          .eq("status", "incomplete")
          .lt("attempts", 3)
          .or("error.ilike.%429%,error.ilike.%Consulta DJEN interrompida%,error.ilike.%DJEN sem conclusão completa%")
          .order("created_at")
          .limit(1)
          .maybeSingle();
        if (failedError) throw failedError;
        if (failed) {
          const { error: restoreError } = await db
            .from("jusbr_batches")
            .update({ status: "queued", error: "Reconferência direcionada pendente.", retry_after: null })
            .eq("id", failed.id)
            .eq("user_id", owner)
            .eq("status", "incomplete");
          if (restoreError) throw restoreError;
          next = failed;
        }
      }
      if (!next)
        return respond({ ok: true, persisted: true, idle: true, message: "Nenhum lote disponível para retomada." });
      body.id = next.id;
    }
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.id || ""))
      return respond({ error: "Lote inválido." }, 400);
    const read = async () => {
      const { data, error } = await db
        .from("jusbr_batches")
        .select("*")
        .eq("id", body.id)
        .eq("user_id", owner)
        .maybeSingle();
      if (error) throw error;
      return data;
    };
    let batch = await read();
    if (!batch) {
      const rows = validateObservations(body.rows);
      const coverage = validCoverage(body.coverage, rows);
      const { error } = await db
        .from("jusbr_batches")
        .insert({ id: body.id, user_id: owner, rows, coverage, pending: rows.length });
      if (error && error.code !== "23505") throw error;
      batch = await read();
      if (!batch) return respond({ error: "Lote pertence a outra conta ou não foi gravado." }, 409);
    }
    if (!ownerMatches(batch, owner)) return respond({ error: "Lote indisponível." }, 404);
    if (batch.status === "queued" && (!batch.retry_after || Date.parse(batch.retry_after) <= Date.now())) {
      const { data: claim, error: claimError } = await db
        .from("jusbr_batches")
        .update({ status: "starting", updated_at: new Date().toISOString() })
        .eq("id", batch.id)
        .eq("user_id", owner)
        .eq("status", "queued")
        .select("id")
        .maybeSingle();
      if (claimError) throw claimError;
      if (claim) {
        const rows = validateObservations(batch.rows);
        if (!rows.length) {
          const { error } = await db
            .from("jusbr_batches")
            .update({
              status: "incomplete",
              error: "Consulta vazia ou estrutura bloqueada; cobertura integral não confirmada.",
            })
            .eq("id", batch.id)
            .eq("user_id", owner);
          if (error) throw error;
        } else {
          const dates = rows.map((row) => row.date).sort();
          const userDb = createClient(url, anon, { global: { headers: { Authorization: auth } } });
          const { data: start, error } = await userDb.functions.invoke("sync-djen", {
            body: {
              manual: true,
              date_start: dates[0],
              date_end: dates[dates.length - 1],
              bypass_name_filter: true,
              process_numbers: targetedNumbers(rows),
              targeted_only: true,
            },
          });
          if (!error && start?.retryable === true) {
            const { error: waitError } = await db
              .from("jusbr_batches")
              .update({
                status: "queued",
                retry_after: new Date(Date.now() + 60000).toISOString(),
                error: "Aguardando vez na fila DJEN.",
                updated_at: new Date().toISOString(),
              })
              .eq("id", batch.id)
              .eq("user_id", owner);
            if (waitError) throw waitError;
          } else if (error || !start?.background || !start?.run_id) {
            // An ambiguous acceptance is NOT replayed automatically: avoid duplicate background work.
            const { error: saveError } = await db
              .from("jusbr_batches")
              .update({ status: "incomplete", error: "Início DJEN sem confirmação; conferir antes de repetir." })
              .eq("id", batch.id)
              .eq("user_id", owner);
            if (saveError) throw saveError;
          } else {
            const { error: saveError } = await db
              .from("jusbr_batches")
              .update({
                status: "running",
                attempts: (batch.attempts || 0) + 1,
                retry_after: null,
                error: null,
                djen_run_id: start.run_id,
                updated_at: new Date().toISOString(),
              })
              .eq("id", batch.id)
              .eq("user_id", owner);
            if (saveError) throw saveError;
          }
        }
      }
      batch = await read();
    }
    if (!batch) throw Error("Lote indisponível.");
    if (batch.status === "starting" && Date.now() - Date.parse(batch.updated_at) > 120000) {
      const { error } = await db
        .from("jusbr_batches")
        .update({ status: "incomplete", error: "Interrupção durante início; execução DJEN não confirmada." })
        .eq("id", batch.id)
        .eq("user_id", owner)
        .eq("status", "starting");
      if (error) throw error;
    }
    if (batch.status === "running") {
      const { data: run, error } = await db
        .from("cron_runs")
        .select("status,metadata,error_message,started_at")
        .eq("job_name", "sync-djen")
        .eq("run_id", batch.djen_run_id)
        .maybeSingle();
      if (error) throw error;
      if (!run || run.metadata?.user_id !== owner) throw Error("Conclusão DJEN não validada para esta conta.");
      const finished = run.status !== "running";
      if (finished || Date.now() - Date.parse(run.started_at) > 20 * 60000) {
        const results = run.metadata?.results || [];
        const success =
          finished &&
          run.status === "success" &&
          results.length > 0 &&
          results.every((r: { status: string }) => r.status === "success");
        const inserted = results.reduce((sum: number, r: { inserted?: number }) => sum + (r.inserted || 0), 0);
        const retryable =
          !success &&
          (batch.attempts || 0) < 3 &&
          /429|temporar|timeout|interrompida|limite de páginas|sem conclusão completa/i.test(
            run.error_message || JSON.stringify(results),
          );
        const { error: saveError } = await db
          .from("jusbr_batches")
          .update({
            status: success ? "reconciled" : retryable ? "queued" : "incomplete",
            inserted: (batch.inserted || 0) + inserted,
            retry_after: retryable ? new Date(Date.now() + 15 * 60000).toISOString() : null,
            error: success
              ? "DJEN reconferido; identidade dos atos e cobertura do portal permanecem pendentes."
              : run.error_message || "DJEN sem conclusão completa.",
            updated_at: new Date().toISOString(),
          })
          .eq("id", batch.id)
          .eq("user_id", owner)
          .eq("status", "running")
          .eq("djen_run_id", batch.djen_run_id);
        if (saveError) throw saveError;
      }
    }
    batch = await read();
    if (!batch) throw Error("Lote indisponível.");
    const done = ["reconciled", "incomplete"].includes(batch.status);
    const message = `Jus.br: página ${batch.coverage.page}; ${batch.rows.length} observações; ${batch.inserted} importações DJEN; ${batch.pending} identidades pendentes. ${batch.error || "Reconferência em andamento."} ${batch.coverage.reason}`;
    if (done && !batch.notified) {
      // Deterministic notification ID makes replay safe across request interruptions.
      const { error } = await db
        .from("notifications")
        .upsert(
          {
            id: batch.id,
            user_id: owner,
            title: "Conferência Jus.br — cobertura incompleta",
            message,
            type: "warning",
            link: "/intimacoes",
          },
          { onConflict: "id", ignoreDuplicates: true },
        );
      if (error) throw error;
      const { error: saveError } = await db
        .from("jusbr_batches")
        .update({ notified: true })
        .eq("id", batch.id)
        .eq("user_id", owner);
      if (saveError) throw saveError;
    }
    return respond({
      ok: true,
      persisted: true,
      done,
      id: batch.id,
      status: batch.status,
      message,
      coverage: batch.coverage,
      inserted: batch.inserted,
      pending: batch.pending,
    });
  } catch (e) {
    return respond({ error: e instanceof Error ? e.message : "Conferência incompleta." }, 400);
  }
});
