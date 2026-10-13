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
      a.download = "wnevesbox-jusbr-0.3.8.zip";
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
    setNotice("Aguardando vínculo. Instale v0.3.8 e recarregue esta página e a Central Jus.br.");
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
