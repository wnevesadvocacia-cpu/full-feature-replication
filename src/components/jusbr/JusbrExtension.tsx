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
      a.download = "wnevesbox-jusbr-0.3.3.zip";
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
    setNotice("Aguardando vínculo. Instale v0.3.3 e recarregue esta página e a Central Jus.br.");
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
