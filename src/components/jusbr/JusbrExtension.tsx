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
