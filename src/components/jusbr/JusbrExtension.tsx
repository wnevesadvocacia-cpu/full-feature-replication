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
      a.download = "wnevesbox-jusbr-0.3.11.zip";
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
    setNotice("Aguardando vínculo. Instale v0.3.11 e recarregue esta página e a Central Jus.br.");
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
