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
      a.download = "wnevesbox-jusbr-0.3.10.zip";
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
    setNotice("Aguardando vínculo. Instale v0.3.10 e recarregue esta página e a Central Jus.br.");
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
