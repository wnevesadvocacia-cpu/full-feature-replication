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
      a.download = "wnevesbox-jusbr-0.3.4.zip";
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
    setNotice("Aguardando vínculo. Instale v0.3.4 e recarregue esta página e a Central Jus.br.");
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
    ? "Conferência interrompida. Veja os detalhes."
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
        <span>{notice}</span>
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
