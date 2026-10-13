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
      a.download = "wnevesbox-jusbr-0.3.9.zip";
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
    setNotice("Aguardando vínculo. Instale v0.3.9 e recarregue esta página e a Central Jus.br.");
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
