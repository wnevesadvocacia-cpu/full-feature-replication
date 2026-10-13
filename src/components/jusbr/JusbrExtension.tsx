import { useEffect, useRef, useState } from "react";
import { Download, Link, AlertTriangle, RefreshCw, ExternalLink, ChevronDown, Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

export function JusbrExtension({
  onReconcile,
  reconciling,
  reconciliationNotice,
}: {
  onReconcile: () => void;
  reconciling: boolean;
  reconciliationNotice?: string;
}) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [notice, setNotice] = useState(
    "Conexão ainda não validada nesta sessão. Abra o Diário da Justiça no portal e confira a extensão.",
  );
  const [batchNotice, setBatchNotice] = useState("");
  const paired = useRef<string | null>(null);
  const { data: reconciliationState, error: reconciliationStateError } = useQuery({
    queryKey: ["jusbr-reconciliation-state", user?.id],
    enabled: !!user,
    queryFn: async () => {
      if (!user) return { pending: false, maintenance: false };
      const [queue, latest] = await Promise.all([
        supabase
          .from("jusbr_batches")
          .select("id")
          .eq("user_id", user.id)
          .in("status", ["queued", "running", "starting"])
          .limit(1),
        supabase
          .from("sync_logs")
          .select("status,error_message")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);
      if (queue.error) throw queue.error;
      if (latest.error) throw latest.error;
      const maintenance = latest.data?.status !== "success" && /\bDJEN\s+503\b/i.test(latest.data?.error_message || "");
      return { pending: !!queue.data?.length, maintenance };
    },
    refetchInterval: 30000,
  });
  const { data: batches = [], error: batchesError } = useQuery({
    queryKey: ["jusbr-batches", user?.id],
    enabled: !!user,
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("jusbr_batches")
        .select("id,status,coverage,inserted,pending,error,created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return data || [];
    },
    refetchInterval: 60000,
  });

  useEffect(() => {
    if (!user) return;
    let active = true;
    let busy = false;
    const resume = async () => {
      if (busy || !active) return;
      busy = true;
      try {
        const { data: identity, error: authError } = await supabase.auth.getUser();
        if (!active || authError || identity.user?.id !== user.id) return;
        const { data, error } = await supabase.functions.invoke("jusbr-ingest", { body: { resume: true } });
        if (!active) return;
        if (error || !data?.ok) throw error || Error(data?.error || "Retomada sem confirmação.");
        if (!data.idle) {
          setBatchNotice(data.message);
          await qc.invalidateQueries({ queryKey: ["jusbr-batches", user.id] });
          if (data.done) await qc.invalidateQueries({ queryKey: ["intimations"] });
        }
      } catch {
        if (active) setBatchNotice("Retomada pendente. Os lotes gravados serão conferidos novamente.");
      } finally {
        busy = false;
      }
    };
    const first = window.setTimeout(() => {
      void resume();
    }, 5000);
    const timer = window.setInterval(() => {
      void resume();
    }, 30000);
    return () => {
      active = false;
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, [user?.id, qc]);

  useEffect(() => {
    paired.current = null;
    if (!user) return;
    let active = true;
    const restore = async () => {
      const { data, error } = await supabase.auth.getUser();
      if (!active || error || data.user?.id !== user.id) return;
      const { data: settings } = await supabase
        .from("oab_settings")
        .select("oab_number,oab_uf")
        .eq("user_id", user.id)
        .eq("active", true);
      if (active)
        window.postMessage(
          { type: "WNEVES_JUSBR_RESTORE", owner: user.id, settings: settings || [] },
          window.location.origin,
        );
    };
    const listener = async (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== window) return;
      const m = event.data;
      if (m?.type === "WNEVES_JUSBR_STATUS") {
        if (active && paired.current === user.id && m.owner === user.id && typeof m.message === "string") {
          if (m.message.startsWith("Jus.br: página")) setBatchNotice(m.message.slice(0, 1000));
          else setNotice(m.message.slice(0, 1000));
        }
        return;
      }
      if (m?.type === "WNEVES_JUSBR_SCAN_ACCEPTED") {
        if (m.owner === user.id || !m.ok)
          setNotice(
            m.ok
              ? "Conferência solicitada; aguardando resultado. Isso não confirma nenhum lote."
              : m.message || "Não foi possível solicitar; recarregue a extensão e vincule a conta.",
          );
        return;
      }
      if (m?.type === "WNEVES_JUSBR_PAIRED") {
        if (m.ok && m.owner === user.id) {
          paired.current = user.id;
          setNotice(
            "Vínculo restaurado. Aguardando status da busca segmentada. Estado vazio e persistência/importação ponta a ponta pendentes; cobertura incompleta.",
          );
        } else if (m.message) setNotice(m.message);
        return;
      }
      if (m?.type !== "WNEVES_JUSBR_CHECK" || typeof m.requestId !== "string" || m.requestId.length > 50) return;
      const respond = (result: Record<string, unknown>) =>
        window.postMessage({ type: "WNEVES_JUSBR_RESULT", requestId: m.requestId, ...result }, window.location.origin);
      if (paired.current !== user.id || m.owner !== user.id || !m.batch) {
        respond({ ok: false, message: "Conta/vínculo indisponível. Lote preservado." });
        return;
      }
      try {
        const { data: identity, error: identityError } = await supabase.auth.getUser();
        if (identityError || identity.user?.id !== user.id) throw Error("Sessão WnevesBox expirada ou conta alterada.");
        const { data, error } = await supabase.functions.invoke("jusbr-ingest", {
          body: { id: m.batch.id, rows: m.batch.rows, coverage: m.batch.coverage },
        });
        if (error) throw error;
        if (!data?.ok || !data.persisted) throw Error(data?.error || "Servidor não confirmou a gravação.");
        if (!active) {
          respond({ ok: false, message: "Conta/tela alterada; retomada necessária." });
          return;
        }
        setBatchNotice(data.message);
        respond(data);
        await qc.invalidateQueries({ queryKey: ["jusbr-batches", user.id] });
        if (data.done) {
          await qc.invalidateQueries({ queryKey: ["intimations"] });
          toast({ title: "Conferência Jus.br — cobertura incompleta", description: data.message });
        }
      } catch (error) {
        const message = `Conferência incompleta: ${error instanceof Error ? error.message : "Falha de envio"}. Retentativa automática; importações preservadas.`;
        if (active) setBatchNotice(message);
        respond({ ok: false, message });
      }
    };
    window.addEventListener("message", listener);
    // Content scripts are present before mount; retry restoration also handles delayed hydration.
    void restore();
    const timer = window.setTimeout(() => {
      void restore();
    }, 1500);
    return () => {
      active = false;
      window.clearTimeout(timer);
      window.removeEventListener("message", listener);
    };
  }, [user?.id, qc, toast]);

  const download = async () => {
    try {
      // Keep the downloadable package in sync with this release's verified adapter.
      const packageBase64 =
        "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";
      const packageBytes = Uint8Array.from(atob(packageBase64), (char) => char.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([packageBytes], { type: "application/zip" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = "wnevesbox-jusbr-0.3.12.zip";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      setNotice("Não foi possível baixar a extensão. Tente novamente.");
    }
  };
  const pair = async () => {
    if (!user) return;
    const { data: identity, error } = await supabase.auth.getUser();
    if (error || identity.user?.id !== user.id) {
      setNotice("Entre novamente na conta correta.");
      return;
    }
    const { data: settings } = await supabase
      .from("oab_settings")
      .select("oab_number,oab_uf")
      .eq("user_id", user.id)
      .eq("active", true);
    setNotice("Aguardando vínculo. Instale v0.3.12 e recarregue esta página e a Central Jus.br.");
    window.postMessage({ type: "WNEVES_JUSBR_PAIR", owner: user.id, settings: settings || [] }, window.location.origin);
  };
  const checkNow = async () => {
    if (!user || paired.current !== user.id) {
      setNotice("Vincule a extensão na conta atual antes de conferir.");
      return;
    }
    const { data, error } = await supabase.auth.getUser();
    if (error || data.user?.id !== user.id) {
      setNotice("Entre novamente na conta correta.");
      return;
    }
    setNotice("Solicitando conferência; mantenha Diário da Justiça e Intimações abertos.");
    window.postMessage({ type: "WNEVES_JUSBR_SCAN_NOW", owner: user.id }, window.location.origin);
  };
  const interrupted = /interrompida|falha|não foi possível|indisponível|expirada/i.test(notice);
  const working = !interrupted && /pesquisando|aguardando busca|solicitando conferência|já em andamento/i.test(notice);
  const summary = interrupted
    ? "Conferência interrompida."
    : working
      ? "Conferência em andamento…"
      : batches.length
        ? "Conferência complementar · cobertura parcial"
        : "Conexão aguardando validação";
  return (
    <section aria-label="Conferência complementar no Jus.br" className="rounded-xl border bg-card shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Bell className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold">
              Jus.br <span className="ml-2 text-xs font-normal text-muted-foreground">Diário da Justiça</span>
            </h2>
            <p
              role="status"
              aria-live="polite"
              className={`mt-0.5 text-xs ${interrupted ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground"}`}
            >
              {summary}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="ghost" asChild>
            <a
              href="https://portaldeservicos.pdpj.jus.br/central-comunicacoes"
              target="_blank"
              rel="noopener noreferrer"
            >
              <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
              Abrir portal
            </a>
          </Button>
          <Button size="sm" variant="outline" onClick={checkNow} disabled={!user}>
            <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${working ? "animate-spin" : ""}`} />
            Conferir agora
          </Button>
        </div>
      </div>
      <div
        role="status"
        aria-live="polite"
        className="flex items-start gap-2 border-t border-border/60 bg-muted/30 px-4 py-2.5 text-xs leading-relaxed"
      >
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
        <div className="space-y-1">
          <p>{notice}</p>
          {reconciliationState?.pending && (
            <p
              className={
                reconciliationState.maintenance ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground"
              }
            >
              {reconciliationState.maintenance
                ? "DJEN temporariamente indisponível. Lotes preservados; nova tentativa automática."
                : "Reconferência DJEN na fila. Lotes preservados; processamento automático."}
            </p>
          )}
          {reconciliationStateError && (
            <p className="text-destructive">Não foi possível atualizar o estado da fila DJEN.</p>
          )}
        </div>
      </div>
      <details className="group border-t border-border/60">
        <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-2 text-xs text-muted-foreground transition-colors hover:bg-muted/40 [&::-webkit-details-marker]:hidden">
          <span>Detalhes e configuração</span>
          <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" />
        </summary>
        <div className="space-y-4 px-4 pb-4 pt-2">
          <p className="text-xs leading-relaxed text-muted-foreground">
            A conferência usa o Diário público com o portal autenticado. Comunicações privadas do Domicílio Eletrônico
            precisam ser conferidas no Jus.br.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={pair} disabled={!user}>
              <Link className="mr-1.5 h-3.5 w-3.5" />
              Vincular extensão
            </Button>
            <Button size="sm" variant="ghost" onClick={download}>
              <Download className="mr-1.5 h-3.5 w-3.5" />
              Baixar extensão
            </Button>
            <Button size="sm" variant="ghost" onClick={onReconcile} disabled={reconciling}>
              <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${reconciling ? "animate-spin" : ""}`} />
              Recuperar publicações DJEN
            </Button>
          </div>
          <details className="text-xs text-muted-foreground">
            <summary className="cursor-pointer">Como instalar ou atualizar</summary>
            <ol className="mt-2 list-decimal space-y-1.5 pl-4 leading-relaxed">
              <li>
                Baixe e descompacte a extensão. Em chrome://extensions ou edge://extensions, ative Modo do desenvolvedor
                e escolha Carregar sem compactação. Para atualizar, substitua os arquivos e clique Recarregar.
              </li>
              <li>
                Recarregue Intimações e a Central Jus.br, faça login no portal e abra Diário da Justiça. Vincule a
                extensão uma vez e mantenha as duas páginas abertas.
              </li>
            </ol>
          </details>
          <div className="rounded-lg bg-muted/40 p-3 text-xs leading-relaxed">
            {batchNotice && <p className="mt-2 text-muted-foreground">{batchNotice}</p>}
            {reconciliationNotice && <p className="mt-2 text-muted-foreground">{reconciliationNotice}</p>}
            {batchesError && <p className="mt-2 text-destructive">Histórico indisponível. Conclusão não confirmada.</p>}
          </div>
          {!!batches.length && (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="py-2 pr-4 text-left font-medium">Últimas conferências</th>
                    <th className="p-2 text-right font-medium">Importações</th>
                    <th className="p-2 text-right font-medium">Pendentes</th>
                    <th className="p-2 text-left font-medium">Situação</th>
                  </tr>
                </thead>
                <tbody>
                  {batches.map((batch) => (
                    <tr key={batch.id} className="border-b last:border-0">
                      <td className="whitespace-nowrap py-2 pr-4">
                        {new Date(batch.created_at).toLocaleString("pt-BR")}
                      </td>
                      <td className="p-2 text-right tabular-nums">{batch.inserted}</td>
                      <td className="p-2 text-right tabular-nums">{batch.pending}</td>
                      <td className="p-2" title={batch.error || "Aguardando conclusão persistida"}>
                        {["running", "starting", "queued"].includes(batch.status)
                          ? "Em processamento"
                          : "Cobertura parcial"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </details>
    </section>
  );
}
