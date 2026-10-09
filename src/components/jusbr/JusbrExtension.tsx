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
        "UEsDBBQAAAAIAPtkSV2GQ02dSQwAANwoAAANAAAAYmFja2dyb3VuZC5qc91a3XIbtxW+91Mcz2SyZEut6MRJaiqKRlbUxqljeyQlmY7HtcHdQwr2LrAGsJRVig/jyUVmOpOrTp9AL9Y5+NnFLilZctOb6kYkFgvgnPOd7/yAvKykMseZ4pXRgySTCtPXOhnu3Mmk0AZYVT1VfM6Fhl0QeAbHaAbPk1NjKj3Z3j4TuEA9le/STJbJCNoHZ2fplQ9ndVFszZCZWuGWwqrgGTNcirSQCzYtMGVVFc/n+ValcMHxbGtr+tUXn7PxZ/e2ZrP7s637+MWDren9Wb41ezB7cO8zdj/7ajrrrPOikUVaQWAXNIocFex+A0sw6hyWoNDUSlgBfzx6PHAT0loVw9S9tQMryJjJTtvJSUKDq507BRqolMxQay7msAszVmh04zpj4oTpN6S9uij8ICrOCtiFZ0qWXGOqUMtigYPhzp1ZLTLSBeC7rKg1X+BgJoawBCeDcWu5FVJzioIe77RL0oTUnnQwGFoRV8OdcGR6uAOrO0yfiwyarbRhptaDErVmcxzC8g747egJwi6wM8YNZKdKlphqIxWbY1rIjBXp3AJCnglUySgxbPooT0aJ05pVPlz3tkYzWILfeRQ+PKXVJm731C4NK7sSn8EgHv30Uz/J7ktfW8Cmp0yHyXZk6CQLshk27Utm2FRbgaJFhx1tkhHtSdxZDJvuEUxo5wAew6YxcmB3dxc6x9iwJwHuByd7vPeIAHpe4QSSZ0+PTvYfvzw+2T/58TgZgVxTUaM9WA3XEHAHYNW3BLPWJxM8ZPkcT/Ad2cLgOzOB5G5iVb6Glaouq4FTJCmgxf3Qg4y26niDUTXSoPW0SP8fja23NdbYx1hYlRssyUGsXuzMvXTGRT54S6p463ET2STg6G2q0KjzfQNf78K39EjIs8EwMvZdWjsWM5bptqhy7/uFPWTg4uJKFN1dQ5E5VfIMDpWSapDsTxWDR8Lwkl3+evlv1CAYncgwWHCR1QXLGVRMMTq+LJlKiePjgyvUdWE2nv3D6Dz47vDgry8f7p8cfHcFNqcEyIkzz6orvdt5L5VvSAH+a1qh0lwbzLuShskB6xcXkDyWBkFjSZLMuLIq+EVCLokWFzyXsbTb23ByStPVAlWiIa8VxQqwWAEhz+j4GnIs+ALVObCZQQXhNCLDEXCRY0UhQpjiHOQMuI2ikMmyKtA6VSTfujwBMcEfW6p3zubdtpkVTFQwg9rcxmWcqwQPac/kVvLgJ2iRXdzXLsDjY15J4N/XeqoOKHVg2RshzwrM5+j3GEVL+888D15Ffy0Ywj4+HHm9hagUZq0AC43/dzpcOgBOmnUdHi8u4PmLYVqyKhAYzy17eU3CHiwhTdO3I/D0NYnIC/4IX47H4zGsYAJvhx1d31rv9n/IggY+Tbi5AX4/9d9a+f8z1bfAt8ofvB3FkaOv8/ZTR9+vPlli0PYKjtCgMMzwBQNWG1levjc8YzueYwK7VwqJwVjOdPrKr0sWWsGMC1YUISxtyks/IgSHkEvp7DNWa8wbi7QpmY+2BYq5Oe3DI+QcBVOlTjOFzOAgsWpLKJCcnaKYwA/MnKYlezfoYPhzwvDIP+RikKZptGNsoRDCLy5gPBzGyu8dM9WyxP5b3cA/BI3mhJcoaxMyKVhInvscaAdWo3vj8TjSPjhu2ihxgUwFgddU1+qVUpFN+nQiwddwbzy+QrcbkN2uO7HGb/VxlWz0hpfti45sqzurtjhxs5osMFQ5wfWasodej0qgCtVMqvLYvp16pDb792slb721Jddz0njZ/6Z60WgMF3OdjJKCaXOELD8UbcrpIG9zlii3ifmGnl1jvW92Y/PdwniUQwfbBX049kgOpJihuvynyDgDNq+ZypnIJaBYcMqBNBTSoIbXl++h4LnUthqUJSWEEcEAqy7/pcEoJnSznk+byPxNdqs3pohva1TngyXUqpi0hbtlrCK3VMUzqdMqr16nr2udTtX2H1yF0abAuqGOnojf2xdAUFKH2ly+BzZFZWQKf2aXvzIoJGXIQoLbbwcyhTmSAFyDqEXGQNO7GatMrSxnOsF8yaAPUBjly+fpNX2BJimvmDkVrEQbD5LtzL2/lcmyFjxjmUSdbGgZOAJ2XYNuwWDFt3WKPwFtRQXaAokRmiPS4+GQ4NS+0TzsaLNb7J5KOuz6NrcUlJa5XrC4XqLZa8a0lQqDoPIc4cBrLRQuErzBKUsvMONSIHzLL98rAjSjp4Zf/spSeOwMT7ZdoOIznrFcgkBtGFSX7+dcBAgHPQi24HPbbPowL1gOeGYh9aR5LebudrF001QyXBTHtuBD87922dq6ylqvvk5xGVMK50ylcIwQnAEqzLlyLjICehdBYIGNXj7EQptOOmnFGtFzYt59MxkH66/zQ13lFPAJESnPR0viiZvRxEbfuoILN4DEU8VOTI0yqKpEYaQri7ngGWcKbNW8iQCXVxT8N6ybyaN4XDIfH+w/uaJWPuMil2eTKL10Iz6yRKFpOIIQs8Ia4Xsv9wl1MxfPlJwr1Jrg6XP9K5sivVrgBoWCS4MCPXTmJ0fo9F5jhGPn6ykcaqNqoudtjdrSddevrS2aTMSrWdXU8sBUCq/nlOX5Y1uooxoMSlIPtXKpOqqK86Ykua5YIW09T57tPzpKRsnR4fHJ06PDZGTt9fLJ05+TFykXWVHnqAdlSsZs+oqe9notSNev8T1lx913fYOZSJi+bv/9+XjrAduabb1Yfv7l6pNtnlIhMvAVjW1yJMNey+eny9+osSOBi8Xlewrtaz2dWydA/WLL6eJGSmh7sW1R1qvIYAnyzcQFi6ZbOYHkJ9uhIlC4jhUTlLDk6F2RqzRxETMcyW3pYlJzpPW+yjUVn21gTaC1g3VOZ6oJdE02aurDKLPbUB62XhTstqE431iLd9RDuV7DC2GlRnznX9d0wte03z7qFWgdNH1H6aFNFPPYDIpLlVJRSvmDIIv1bWSUzJgCCQuPxwiFHzRDV8rRLc3SUl/Z0N6IFD64ShVkEG/M5y9GkJ1i9qaSXBg9geVqBEStB66Lh4cin9hCxA17xp24kX5hZa26XMVmva7upddt2VuRhvNH4gcuaoN6Al+Or+oTtA7vW4nk8fCw1pTe4pxiGeX0mSwh41khrQNFcW4HMkmxsFYMMGon/EKpgjVp+M9FTgHRtzObbPlWSHU4JZR2rWbNcaPIn/QQSpyKZcN2bWbXZwR/VXJ0uP/t3yJW+H1qwggdfsQlPz3S7NSHt+ClKJuKc8eYLOIyvUcKa9ZZt8Zz16t/9vTRk5OXfzk8SUbxwPH+T0Tz3/94/PDIt/OvC3cfqdLI7boKzmRRYGakeoxM9+NQXHMT+wbARTcj4ZGfGlbec90eTTT96pOlTiWbvqxnq/BR1OUU1eqV5+43eN6PtQfkGNtP9x8CKwxSCUneRM4BnFhSybKKIRlO3PDY2nUNvZhzXUlx+dsCi96b7vxddeyllOwU8E0MjIbbu3P9fahVTcylfZeqDRVjU0Z3JSF5dhW2k050kooPord7iAkluxsJ3QrSa1RTu8l2qrt5a+zYPeQON7FRi62QEEdo20ufW/O+sDdtdVFcnVb0nSL2Ygf7dl0g1LRfu53qu9E8guYTC7aU60fC4BzVoH2eVjbJvriA3hi1/TYNf0PtpLFddl8pdp5ybf/Ha2pE4ZLO+G0bdvogbw+6KaVcl5taQTbBCXiNnlxcUDgcgVf4JFZXo/T2VqCJr7Db6arbsUgcPeq69tolxnXojFaxp4633YNl9HU9ml9Drs3dyHXRyF/cfyR3eur8GD7cxGQRi7nkAnLUGVOGbfB3n34cG8XFfFB2bl6bos0uIMUpZo4GU13wDAfjEdwfj9vrvhsEKK87mybEcWgDysvU3irvpUqeaYtxP2IHQuvVOklPC/bGeB3kv0vVtN4f7pZtTbGD7wwKV+lK+Nn+WOqhfAd1yWCB/+ikNx/oKf/p464E4q4ydE95aLvH/pIbd0I3Lbp3in9N0G0lNyd3Rr3x5TEKK5+TddT7aYszbEDSze6UcizYeZRb32v8eUPgsHvnMSpXQ/cDq9DhoW6pbSP4keFO9zro9o2DuAXzZti7gBnak/pf8rg2BbpDdPyyuTu0P/Oi022usrFxXPpBWOdqxf1Ch4a6GpVinz50eir2kTsGyWu/pm2H2N9vrSumP9FWQGsiNydoGzvHhilTV93GzqbbuLWl/gNQSwMEFAAAAAgAAAAhAMSG0WHfAgAA6gYAAAkAAABicmlkZ2UuanOVVG1r2zAQ/p5fcYVR2eCqGYPBErySpoZ26xuxs34oXdDsSyoaS56kJITUv2Yf9kP6x4YUx83LMrqAiXQ66Z577rlLpdAGChQZFyMIQeAMrljh+e3GjItMzijLsmiKwlxybVCg8kiOWrMRkgCYnosU0B5D+BkWDQA+BM8ZqJYTlSIchCEsn4Ln56UvlYqPuHBHY5kyw6WobD4oNBMl2g2A1GHLIaxuZcywdhXintxdR9+iePClH5/2Bredix4JNm29KE5uetG2Oe52rgfXN3fkgXKRjicZai8/oWZeoA+Hh3D8/b559IkdDY8eFh8+lu+OOTWojZdTOROobBKE+L5LFsCoebVa4VWoCyk0QghsxriB9FHJHKmaCMNzpBpFdrVk0FuADduC3IWnKDJ9x82jR2qQPpzA6w7+4rpK03muNtACsuQEHGp7zy0C0GgMFyNtTas1lL4l1v6qqhdSm/9Euctyp9uNbpPozMHZqVd0RgKglNaElcGOGpaoSkiZSR9h8S90ewLIpxYM2XjP81A2wH1WU5UKIAzDrdd6Udy/TIiVR9Uq9JFpL6cKf05Qm4usFsTqfIRm49xbOCg5lU8ugFETDKBApW1fZfak3qw5ZFI45u3/mrlqwRbERnEx8nJaWSp5Uj3mKXrNAN43m02/ru8KXYZjNLgB0DqUDeu4JVgpKqrtKKingJcHMLBatppSWIzn/voIyNeovL3pJZ3LQZx0kn5MVkS9uZTVvV0lv5mEioN98nLoq/pYei1ba2Oo3EzJDi3SPY+6XwennaR7TnZHVk0qhJCqeWEkVUxkMu/3L87saH0thEbj1e4rIq3Dm+lxUIi9Wr+yTdQP2z127xb7iNBoEp6jnBjPq2u5TP1gXfXrmn/NfEdbm8raZNk15FoBSYxqyjOpQGNuSRxylbOX3y+/ZBvG0iAUCjWqKcskFEwxGxiFYYZPGSWVvMsAPjRtqe1miczVs+1U/QdQSwMEFAAAAAgAzIZIXQQMgxwpCAAAXRcAAAcAAABjb3JlLmpzrVjdbtvIFb73U5wAQUTGNK0Ei7SVohhpnAAudrvBOumNV23GnCNpGnKGmRla0dp8mEUvChToC/TWL1bMHznUj7MF6gtLGs6c/+87Z3h6Cu8biaA00QgVKVaM4xRqITUpgVBSa5QKqkZpqKW4YRQBzX9e4Mk1KT4jhUJwLUWp8qNCcKXhT426lm+ERJjB7RGARELfcpoUKyw+14JxrTJQqDXjS5XaLQBsAcmjsHiWl8iXepWCRN1IDrwpy6nd51QgpwpmnZC8InWiYPbKCwvbCphBpPUsv/r0+Fblglz/rVm04StvqmuU7ae50xDpMMfPcoXLCu1xopOTZ+lZbh7d3ZlnNUomqF0Jp73JxVm+YJypFVJ48gRO//ozvf2uPfmZ3j73/x+f5hqVTry00SiFM6t1Evnbpu7TSzWO53iDcpP8UYgSCfeHVK6E1El6NZ5H59vsCGDNOBXrpCRKv+U0Ay7WMINzojHnYp2kIQXObaWJ1DADvx3O4AeiV3lFvib2SE2kwiAshRP4HTyF37/4bmz+nPAT+MM4WkyNQbvLA79und4JcFxb0xL7O821uLj88VJLxpdJmquSFZiMM3g2TjPjdnSAi/VD26HtAoL8S4ONVaExA7HmKDNgGqu4Gu3T3D6ER7OZ25aCXkmxhrdSCpmM3giuCVC2QIlcYz7y2TLnvQCryuT3ap7mSlSYfDGF+iVnFGazmVWbM5p2tW6PPSzGoQNezeC5Ce/ApHesJKboGZlAIa5R6kYSYFyjlKKqGSWdlV3s8zz3sbBqJnCV5/kexZnba0zuwka0xqrWagLjzEiUm9d6AmNo51HESfGZi3WJdLkTdfr/ivlhb/aFcMFKjTLKhVFnjOmNts4kzllTXHA70OEe9O7bRIafcAzPonCY8j/2QGI8eWFw8MIBxn7AU3gOT5/2OwbCMniRGsOcWYGOEsc9Q/RKVE1p4Hs1n/olSjYw20LdQkhISuzRHkHbiTUhlDqd+h0v921BTrsNxzNLBJRsgkHgjcnrRq2S/xHge/DdxcYrhBdOX3bAsvQB2R2ttnHpOHu7/Ku6ZHoryqZI4wBZCEdKh6V6zgjc/4ezQoCWDS8IFZA8G4+hlqxCJoVKpwOQFqKqS9Qkh59Qi4pQAgil0KiglqhQ3hAqVFfyLsEVo7TEB5IYSm9RCiGTmMZjy08Onk/htKsfOIXn6SEWv+qyHJ/fTqSz98HsGKLZrhfv5nHfV75ZO7170M57MlIbXkAhyhILfRnQtCCFFnKTRQNDBorcYAZYMW3AbKYimEGS2kmjDTXhcaTtvGOYoZfg2CRMN5aFAnx7mJyewve4JMUGGD9ZlGy50nBxrqAgnAsN12hUN7IWCqlFrmU/R3+gkMhilQ8ml9JJm8Ejr/Oa6GJ1YacMt1CTJcIreBZmloH5njyDoZMg7wyu/GkbVjNn6BVTnUeeZj1gOgEXnOJX2x2M1khaZMrEsKVC5DuPzSJM4GqeQRinJrAgpcIQW2+912umwkGcr8bzKZA1Ydpm0xk5QP96xUoMTSI2Gl5uyerG0pC6vmf5Le+8jf2WkBRmJW5Z59Qc94l4MBU+klZSt/huGJU4TF7lbLbfDYOF8CcbPoFCbmotckk4FdXHjxfnSRqS1qXHJMKXkxszM6iRU8aXl2zJiW4k9usmIZPtfFir5lEturx12YRD2RoGPLgZ5qawx+UUPFyTT+9RfWmYMj7B49tYpWOnFsj2OnLaTkN8+1PbOWtPt56EwLYZ1Pe/LhmPJJMltvmnzhMtN1GFOIctmDwtBTrawZQrCE9hjbQcEN17dirI79lBz5768Vv7a4upHC2bCGnfyE7ruLJbaaEwpQKJmT1ljAmTR7uYF4KiHb5GH376+Oc3rz+8PR+FNmp37Ev+QULbasAfbNd1aaSNJFwbMnWddbrbWLP9zTi02x7MK1LeoLmBOgK0g8IgU9sHQoWYySzguiubeVdsTlbhIzuouMxgMM9zpzpS8BB39yB0x67G872I3s8lD2MyIGz0+oYpAVQoGIw2E5BIm1/M5dNYcf9vQcUU/k44lgT4/T8EFCg1W7CCRHeSAOB2b7dO/BuJQ1168DbB781vULIFM0wxqI1ADKc1MVC9/6cxyXCZuVWoSXitgQpIo5FrY6dQoLCyb0Du/8UL1tsdDwFR/7+7M7eG306uIeQu3MED1+QHcBs0LVv9L2cm/uMeZVs3gqFI81ImOt1F30bOn7m7g0evpSSbnCn7mfiJXoq1Ss3jsNWuhGvpkydh8je3l40Ft6GRdCsBfyG/MGHjWQi+YLLyORANoNKysTCkqArBV1jEF9dh40WeM16UDUUVDFShF23rfO95WWKNmhkS+MYd2Y5nl+QG4RoX5p2WKTNb+yXZQKNQgSIVup4IF+fGMi0JV3ZYXBPlxTa1RprvWL/dO03wDjwxYdxxb793VUNFc4DwIr7Lvu18NLh6zjXX4H2U0w0F+wt9Z0bYdsXcb/eQTGjn7pEJfnILrJsqvNYMTAF2Qs0P49wNSgswD0F3RDY8AK+v/ww+M3NjGBTuGYzslxFMYGR2jcwtgCjBJzD6ATWhhhGmYF6HmmKiaMO4lKTsiCQfQdvdNl08gw7zfjFAA25j5+O49n3btWJLvHbg6WITCeX4VfeA234zVA24znGwqMx73cG1cn9P2Q6Ze8XhiSvqacizneTOf+PQ2Hecg1PGkMaMv8lgmh+4/D2rmEagGAYydeC+7Vxvs6N2emTCqTc1igUsS3FNyg8rptyI0nCKC8aRjtLoWR6/8e6+T4/+C1BLAwQUAAAACADPZEldd/MhpIsRAAAxMwAABgAAAGRvbS5qc9VbzZIbN5K++ylSHoWqymIX2Rp5vdEUpWi35Bg7NJLCavswrR4JrEqSkECgDKDY6mnxtBH7AHvc0yp8cOzBp419Ar7JPslG4qd+SHZLO7uX7XCIVSggkUhkfvkDeDiE51JcQqGk1UoY0FgpbbGEmVZLsAuEqp4KXsBjzjRXMFN6mcMzBSVaxsWwVEW9RGlBcPnO5F8UShoLP9Rmqh+rJUwgTTOYPISrL4AmMRYsvrcwARTUnKJ4lFPLiZKWyHz4AEmS5RorwQpMh6/M3eF8AAkkWW41X6bZuKHEigKN4VOBp12aNBUAn0F6C0UGGm2tJSQJDYxDC1VdugF5IZTEZ6rE1Ooas9ipusx/qVFfvkSBhVX6WIg0OWOas4MFL0uUky+p/5fnSZbPlH7CikUqVYnEAP3mGpdqhWkWKAYuaKkpUXfN63Ytki2xWQGKfI722FrNp7XFNHHzCjZFkWQkovSGHgLL6aXvRpI0leDWyzHLl6xKeUlT9GWXxm0kqk8E0uO3l9+XKS+zLMvfKi7TzhYQ7bM8z4kNN6dxLefZuZuhT7sznHptTYyis6Er7j40crh1CwXcuRPkcSI4SvsjFtakWS5Qzu0CHsKIetBntaxqi+VLeymQ6OaOHBfcXsKtyQQSv3FJO18t+S81TZdyi0szALcYr69OgVxznIpoHGZgF1pdwBOtlU7fkNpqJRBuX7mxa2C1QWkRVA1sOd38Pq/VGNBYXdtaM5CbXxWsmOAlK1n+JhtHzXBTnY3Ox14rZrUsLFcSTKEqTDX+UnONp8yLZ8aEwayj6UIVjLrnFbMLp0tuxcMCpdVMHBRqWUtesEKhSfprSE58HygRTkK3zW+b/0TjmUVjNx+BTVFbBhKNZcCmLIfjqWbwmG8+EiyUjGze8s1vbAxuDCsVlAqEmnPpCc0UJ7nPuF6yUuVJY2sOFdjUwAQaPewZX5r8gb6/7q7idaUVaVLNuImknM1Tz60VPmnEX6IplFxgwUt25FCPcYma1s6mzMTd22UOJkFbUlJ8mmMfPpAqTL60bEq4cJ7PuLCoU6/MQblJM0ljh3/dI7vbQ55bNDalLaSeWTaAZE/H7ootm+4DA+M4wzLJvC4QXG1vveOeK4n7NhKWTNZM0HZgDo/Vkheb3wVXIGtZMNj8u1eK7Z0kD3HTTtL319PaFOx16XzK67c0YcF2ZO5U/Vo6/cGvLZlfTy63osRpxmxr5d8pvaxFWLNqls9lyU2l5Ob3FYoxsHnNdImgoGBa45wRJ05IwWjy7oQ9I71zBxoG3Fq2OfgRTaXImjrTG1zSwlEwWG0+EkiMYcX+xhUgFIqk3WBIa0mmYSJAyZXbg0EQoYOTdRdSprW1SqYOsAaglbIdOUdUCbQ6Sk8d9yi9pzYIuu/fPq3+UcFzq56qggl8qi5QnzCDaVLZg29/TDKYTCYekW/olEXQjqv02lNyQ4svuy61afvw4RoPG3uEub3J9NBYMznHNMrIY3MvbnDBBZMlL5lFQjSS3H4ddtLbr8bwVZSnsczW5nPg5FV595X56uCV+co/vRr6x9tDDyku9CBIcapJbFH0s+Ci1CjPc6OWmLpXov6Z5Fz/LItBznBIkWHF5lwyqzScvHwJJVYoS5TF5RG5LQFTVrwDqwDfs8KCmhrUKyyhULW0qF2ElHeEScEUybEVavTHj7qCPvqUoE3F5KDkq0H1/0KUMUz1Qmmcj5PGABLnuUqlO+DRh09ZL6eoSXAh5HSEKAK0xSIdvirvDuc+HnzmevYGnxnLtB0AynIAVlkmzmESSXYA1nVz5iRLeADNqxsCD6h5F/Rq4WIDD2vPNv/0vANlFDU1S+PSY+C2g5E+2A8ollR68x/v+XLLfQhmup02/yosXzKoNh9JOft9mX0iHVLQv5OJZ79dpv9MPvTWrYgQKTHh49l9X2n2bbw/ietCmCrr4qvI+nCLPeCSOOOGUiI04w72c9pGrZYVL9ku7u/s28BLa9cHaGRlWqHmqoxo5oVxFd0GTHr4Fj6TLgYQ7Ipwgaz06hbCI4F7bNAuIqwVStRL6Ud5cCNVJFXtkeWyxPceRpMXPt5TySA5JdSWTCSD5DEjD0rxC7ltF+7/jcLXX1XiaS7IBgN7+YzL8nuima6c4X/K+yxu8jwdzx/49JbPiTSHBzDaUQE2xc1vTCyU6Uaiyu2wQHvN9gbJqwsniHPfOFMa0uYLqBlcK3Udpa7VBQk7bvhWmKTVRZY58+OyRj9LA0QoRNxdrS72zVI2e4tCuD0de/pubADta+nLtw1UUfezINGz0fl5rxrgigFJB8euvlkfvCqv7q1f5a/Kq/vuxz02LcPsUU6JVW9C8hr7Z7xHMwbyf00doezVsPdwf53dHobN6UC1tvspHp6fN529RORbgo5bjgl68IM/fPBU2tz2H0dbGvSUywUF5oIiPEbhYRcaCrWsSI0azWnsyCiYwJvbVzTj2R/P1wfh8V77eHi+ftMfVTFtXAgl8QIeM4vpm9tX3Kj16Wh05P77y5v+wrwvybn5jktuMfUUKNQ65UsqhtAaQ6NV3798/tJqLudplhvBC0xHAzgc+XyFG7W19mjqwskgeoctEewxH8+bxzpy2ClJ4wH4hrxxWtT6MLaS57rWdampIWtVR6RFjLIBz9JMUYbJ4C2TFMNVaH6puWE9VsiK86o2i/SKlH7gFPGIJh8EFVqHvus2r6AxnSKEJvbgAHRg/i4c0gK63R7C4Wi0zwHNcdnI0EDJV6jnsV6x1yXvOhmaZwCGzyWztcYj+OHl82e5cTvJZ5fpWeBr4Pgc6Nx7Ihp2ng28jzqKzDtn5SCZmlrHRW8dDxY+woO2GWUZWwmqQ/seV8dlVVuXBA7A4chCiRJ1RkvZSXJcfXMX3RyNTwWOlKhcVhhyB3xvk7Z41Uk1OjwEN9Plqs/juL8Ug/ZnJmqacUBVpLpXBNrNccjLU313xw8tq51cN6rrTT7IoPXh6PPpWyxctfD5hXyhVYXaXj5GU2heUXr+p9M/P/2eZBaKiXmllVUknQEkjvEke5QbtN1o0hHfy6rLeE1NpemuSqLIZ6qoTZqNA2t5wYToSKfpR0slTH+yQmlTAjT/FHZ2AFcwradTgeYIKOCBdZaNbxxYLCgMumZkTIemotawZPqdgWM5rwXTbamdGbCqLhZYjkEqKDSWKC1nwmusAaYRYhXHp0QocqIYY6+w6W6pDhn8E3kUl5Bg8e5nKjVye0nY2xPsz0woDRrfInegJn1tP9REgojbhNpqKvqQEoZae3LcaoxGq7RUNSxrbhUdIgSoNICuFrikp/d8yiXBpyFwgkrzJXKtTA4nzNCBgsG3CBpnXDINDFyNaAAztlIaausiOw2qtloZIDuksf30PHCJZZOiBwv/RHJYDWJ6SDbuori9Fh4TP58m9ETSyKthhhmD2j5T9nSHK1e2a1sJiryYyfDIvsIm9eR05CUS5r3J93syeeHOIyA5/fGnZyfHp08eJ+OgA+67x5Z2i4ViJZdzKoe7EvgnZLZk9qDSaq7RmIMp03/g5nUgEQLB+HXKQozvBBtE6uTFzKUsWokFr3PCBMqS6YjZvSwlZnTPK5RQhJ7JwClvlheCF+/6qYmLlEhjXRD0kH7CoUhy4E6aVqgNpvGYYhjBpRNg00g1g7NuyBD5Igd03kbUAm1js7FQH32/o+g6WKxgAqOxf3oAh/f94927LaU2Ur38jDqSF4s/oHIFsc+qGFGQPGx/7q9jSeKTJ1BJElGuW7LVc3S1RHZp+nPfTI+syW8TxWZdwr6+TWRjZEN9D8lg6FOTcPs+Z6PzbZh7zFnf0TmodWrTAF1g/Gx03uhPdw8J1Mcw1cjeeZPpBLxupTG12XJczRyurFtyZoA7hJ/xYvNxhdyQ09Wb3xXBb7+m24kYG9+7UBcyCJdYvV6eUb2Hu0SWSpIMKRVw9EIC4J+7GUBjaM5cQnD+TQYPAolHkLzQuOKqNr4lgSNInpFv8K9btkh/7IJxKt9cwAutltzQsZZRYuUOTY3PEVRtY+sAvh61uhAFH0IFvztbMn/RkyadiZHP8M5ta8+/+F+ztO7BUTxJYXp75X/3FOtdgCRSKXPPA3eSWlEAvSK1KgjqZS2oou/O8Bscv1pHUPHYw3QXm1xjcB7bkBWLMKbCokMvnDg6qCfn1ZL0poLCoOsTPmQ9+r7PuhPBRP7v3Ik+aCda+dZ5PkaRKVcaGJcli2cyslTuFFVRQgyVRqood7Muv4xQaSbvSpvx59o63/08NKdhmWFM7J2Hh/aEPD6EyJbiP1e7fcqN9RHgAEw9tRoxvrJop22I6Gex+rLBe7+thD2BE3oMwOpVhEqUUVaP4PDeaDQawRG4363qBrJScEkqQXl7LtVFmsHdSMhvuolHbEkSGrjXopF/pSLmS3f80LZpZEYRCsXrFAAXCy4Q0s48D5r5u96sXVUPQru736Fx0J3+4YQiRkpoW3IQ1Dx9c+wO6UgNfIB0BLevoko+gqR3cud3k5XKwRVrR3ail2Q9BsGX3CLJ2LhD+p4sWjbbpWz5hWZVdFkjMnPnTscQ6OSg1fb+yrpyyZo9pzjfnXZ054W9Yeb4GmKP8kpjRXkFTd8QDo0+EO2pxf8YvKjs4PXWV/k6gumre1ddfb5AlWWqSneY9ZFfdzWhJO+gj2atBRXa+0R9n7AOVzBx/fKmZNFb5vbHcWMHnX3uLSPO0FNXP+jhBL4mPQ1ph6fd53/t8bEr5s73NRSUbULqmKRZhgaN2fyqPjS3GD40x/YfYikqhm35Eo1h8/awGcetzTZfx/1Nbtd2E29/pypsue/e7ZnbVx08CxhPsVLBC9EzSY/q0uJ//fO/xAs2lCqGE/RQCQRcOot1tn28YnLzm4+9CiULUZMQnQFqRe6BelPn9e2rIKFHkBxBAnejxI4gISzwZbHtAA1+3ONxYjl0DZTECnEJV60nKTlV/GVA9ph7tcmPRrJtqmNwOY/pxQ3ePBbkgmRXqPmMYxmcTvQqLoAwyHSxIJOwPUyORz7uzkZ74rMTNoa7NpREdYppCWHyaDQ6GI1y+s3pxz3tBp7KXaHpjf7pu8N7f7z/9T98c0zFx+ZtT+Trqpxbo101mEtecCZ2h7iq4J4Bblu63TtZnqvGf2aa94kiOZHaWyWP0HHLZV/3w9GF/zfmXjTY5Vj/B+X0WE33NHsh1Q++Sl2iq2KbtqDeyz36fq1XM+8Vyz9JG7Xdph0EcXZ88JfzzvqDBeSKTV/XMy8Jd4i+r4M/lN4OF58ffzv86bt2Se0VmT11AVcu9ALymWpbxKXWBB551XDlfvys2gH9NbXaYDzu3GrcNis2HUB/rXAX9qxtD8mgmiFn7iuqeyMf3BaLqaoe+rrn7iHHNsDfWIPZsUyHK51zdofhTTlm3E/Sfe+9ob3uJ+l7tisGPy0Q7phiUWtNd4gbGHPV/G3T86AQ+t4MYp3KapL0nDidF23RuRbOOlQ+Y7s/NU0f9zq0b1CGz6IZoHGX4o7KbN2k85VYYFTuoZrvZxzIhavP/s/nFUES2zWz1gP5uHXf7m+lo8EvbpEJcNNMtB00BlDgundv5IUvvu5cHIl/Xb5dYrsTqraXQhztPcGqa9+tlvSSnOSZWrUninQz0+IKw1Urd93Bp8Baumxm82+xbNxw3pN+pL1fUF3U7z/HsNZfAAl+wFXk9u6sRxRXtPC75hEgrnXQBP4Pmyi8pUiJdYyBovEPGj1Yx8Bo25eTNlVsTppyOPZP7maSxZxefBPVWT1zdsFNTieMrejX/djJ5SQUjO9NtNpIv71PM94m4envxF1TnCmn0v3BvVtOUdT02vec/atI25WwcLOITlWYuwNPkSppjaErYywEx2gqZ7M95djZNZrgs/Zs6hZEIOFOdN3B9J07sZ8/n+308w1tB3eATS71ko683QzqIneg/3DSP6+nQfHbg+Zbz6GFPWjOg5vzax9o00JYOfCugnqtM1KBuVBTJk5JKzr/E0t8HH/x31BLAwQUAAAACADPZEld1JvRhNoBAACVBAAADQAAAG1hbmlmZXN0Lmpzb26tUsFu1DAQve9XjHKsGm/b3VJtuAEnTpzggNBqYo93vXU8xnY2lap+DOKAxA9wZ38MxckSUSpaELkk9sx7efPm3c4Aigad0RTTek8hGnZFBYvTvuCwoaKC4p2jPcUXfAPfv8FLdprC4auTBuF1G0Uditw9oYszsRDPhltFUQbj01h5Q/FjayICgceNcXj4cvjMoBhemcOnYBg8B5DsUmBLEbiOFPaoOJ6C5AYCJW5QoYC3aI0a4YHQgienyCV6DpEakGaQKAYZnkJjYq8vFhW8nwEAFDFxwA3lDoACLYYmHk8J61jMAD5k/JZjWj9Isk3Jx2o+77JJNd8Iyc385Ejzs9x14pEW3VpbasLUBioDeWsk9r4Jy3usLQn0/neUUaUPtDfUlWV9dbnAs4vzUuulLpd0uSrrpValXunV+QUu5VWt/8zmOSS0inrXjeQovPI7sctrnp9MftQorzeBW6eKCm5HOzOG1h2Hawr9tqcusctm3mUwyjEOI1CRxtamtWff+h6XP8Q2NXYC9Zkgl9ZDnKYFDBw5xkluaSr85Vz9k2fLuN09HsmB+hmODb1qbu7dDD8ZR818+Z31P1Vo92BGnhilf4/T/4zUo2bWwahNtvNXn/p0ze5mPwBQSwMEFAAAAAgAz2RJXbK+NZXPAQAA2wIAAAoAAABwb3B1cC5odG1sXVLBbtVADPwVk3Obh1QJkMjLoS2HVgUkOHD22/VLXGXXy9qJKCd+pUKiAukdEXfyJ3wJ2qRQxGUP6/F4PJ7mkRdnN4mgtzC0TXlhwNhtq2THp2+qtglkCK7HrGTbarT98bOqbYxtoPZM4p7y/C06Rrgctd5lmB7XJ/WTZrMimp34m7bpT9p3kSbSU/kAP3/8j+1P2iYB+22lhjZq1Z5hztRh9PLr05dmk9omtVfENmYEL3DO821mAQqQKM8H8aLgCdDmr/AUPKPWcCVGCl3GCUtZqRspQETY87CwKOWJveTngDDck2cyCQjvxzIb+vkWSBPOd/K3cRCHQw2vASeMpeARrjHSgKDcRd6ze6BzEt0wzgePR6AUwFG2BZGBPUVjj56Ao1GXcYCiE020houQJBvOd/NngfPLF6+AJraiL5FxBoRAGvBfFtmz4yLtTMIY2ZXm76SQMk/oURfjJLCbD0PxDkgNvcCEH1mKjwEjucXSWFhJ63vnX2I0ij3Cg/N+ObjxfIdAcBGNw595uKO87PC2LIxpPRqBy+SpRIX1aAXdF7y4MVA0UZARMnWslmVp4TVcqxB1mZOBZretkqQx1ddatc1m/W+bzRq2zZLl31BLAwQUAAAACAAAACEAHDpGjbcAAADjAAAACAAAAHBvcHVwLmpzNY49asNAEEZ7nWKKwEoQBtcxdiAmhcF1mmDwIn1Igt1ZxzMb/Kfz5AQ5gS8W1sTdV3zv8drhkCJYLR18Dw6p9YF7WP3pIlR9D/fsvjIy3LZhGyC1mjfQYkmXiqhLbY4QK8x7QJlvp3VXu/LK6ho2HG2VxCBGC9o9Xe48/9vpeiX3MUqbAyhHT984EyKtxcbobz+3Xyi7iTbJoFTyRqU9pIMY9IUeunviKwdIb0ORzibezaupmVd/UEsDBBQAAAAIAOZjSV1z+RMAmgUAALwMAAAJAAAAcG9ydGFsLmpzhVbNbttGEL7rKSaAAZIAu3IOuZhQC9lWmqSJbVh2gCII7BU5krYmd5nZpRVB5sMEPQQokGOfQC9W7C5JSbacXvRDzs5+883MN9Pvw0U1yUUKp4KTUKBkvmRwpqBUZHgOKWGG0gie6xgkmoWiOyD8UqE2GhQBqQXw1AglNevlaGBS6SUMYMpzjYl7YkSB5H9KZcRUYLZrYM/f4/lCtmY51+aC1IxQaxhAEPjH2nAymA0NDOAw6fX7cKwqmYEhLrUFDAsujE6AQ84NAqEuldQIKZdSGfu/KhC4BD7hMlMSM0hVnmNqFLHetJIuEKBKWsyXPsyw5Mtc8SyCVQ+A0FQkQeICLkgVQmMYEmqV32MMhH9haiIY/OpsAVIldUMADECjuRIFqsqEoTPy9uGISFEYjL4alHr9twKNhQevDQcs4OUrnVikaDgIaZBIFaXIOKTKGhpV8IxDSaiR7nnGWRBFMbx8dXh4GCUOSIOVNVDDiJk5ygZGOidVIGvCZhpl9gG15jPsYm/snS+Ae55X6KKENEdObVQu0CiB9hZnFyVQx81Bi5x+etAR4sw251wMdZT06p4nlNBlewCFh+k9Pqqa5l3SpuxRVldgliUeQXBxfnk1fH8zvhpeXY+DGJStw6Ptooy7e+qIpdyk84a4VW1BJj2ulzKFrn50ymVY+HoRUwhtS0QtjBWouyMwVGEMQrZ42yf7Lu/KvsNxtBvrwwMEJ0pOkdb/yFS4kuEy4wVKo1hgEULbl/aaZNu/ZYq5a5OdBjvlBplUi9Cxb2jZlPS7Sk/oVBVMp6pE/9aH+aLxY/G8GBLxJRPafYcF02iMkDMdubeb/yxHOTPzCMzcSknTCh/XP2Ra5ap/PjwGITNhG3n94x7zBPiEOLy1ueTr7+t/UbOgATFVBKGvkMY9qCls3+1DaPvyDi0jtwerxoApPrmppvXuA1kVE6T6Ntk522nLALhVnWfL6+TN6OSPi/O3Z1c3v4+uNvXVkBU7FLa4vXdHZOv8N6budpnZvGlL0ib/spWAHao6XgAa9TQWbuuCpXNM70olpNm53Ns9PPgDbCqk0HPMos7BysZ6BCktS6MYWSUtrq/fnoZRDKWrzpcxaER5BJ8+x1AiCZXZgBdCZmrhy3HDpJUby6LroUZvNgq6w3iVm+f5Zow1p/+P4w3LVW72cuyebzP8WuS83ymttCKdKjkVZP9vEd3F1oB0QhXeXqD+UgltqYJTsf5mR+3B6g6XtZOnxiuHcv1tJiSHg5Un39JZM/iAhmc8U3r35gJSNUEyFfmxMCOes9toF4Lr1xNFyJpRN8aZFQYd+sRYqrueTgm5wbAp/zZ3cRNH5LTIYKvmAJsSsm5sJvcW/nj4cRTE29Z1tHEysYr69Py76/Hx5c3x8OrkTRA3RnXUYXmGaE+ghidE21hSRSQyrhPIlUENfFZxyhyPntH1d8vv6bvRGYOTjtsMgRulrYeCS0wRhExVUdp53PFdu889Is8rm1+D2Rg5pXP/2BdKDW6aQIgRrB5FsiPo20P/CA5W2BZnfeum5talbq/amhSdKdSJAzkVkuf5Ela7qxrUdrzubgJKNnsA41n2XmiDEikMixhubK5sZxGW+bLbeGxfFcwmEF4MBhCMT4ZnQTv6bMT3SmTtfPQrhXfQBeHmU8/2ar8PQ30HZo5QckGYgV0+kcAoP6hgMUfp3lcaCVSJUvc12hrX/tj2aru93yHPluH++dwNu6eDzqtGu8LajG2ts36uuvB+sk49XjouR8PTP4Mna8XTPdmqF9Rdwaz2WfTqnl1LP1SG2zDPJ3YbtPlqnO7duPbspo4evz7aSyOmvKcwU2llpYO1P0Y52q8YVqCriSHEtujTuchdxXRdYAyJSWWwW3W6J69Fbqxafwo4Cf6LzyBmwWcn2c8B6/0HUEsBAhQAFAAAAAgA+2RJXYZDTZ1JDAAA3CgAAA0AAAAAAAAAAAAAAAAAAAAAAGJhY2tncm91bmQuanNQSwECFAAUAAAACAAAACEAxIbRYd8CAADqBgAACQAAAAAAAAAAAAAAAAB0DAAAYnJpZGdlLmpzUEsBAhQAFAAAAAgAzIZIXQQMgxwpCAAAXRcAAAcAAAAAAAAAAAAAAAAAeg8AAGNvcmUuanNQSwECFAAUAAAACADPZEldd/MhpIsRAAAxMwAABgAAAAAAAAAAAAAAAADIFwAAZG9tLmpzUEsBAhQAFAAAAAgAz2RJXdSb0YTaAQAAlQQAAA0AAAAAAAAAAAAAAAAAdykAAG1hbmlmZXN0Lmpzb25QSwECFAAUAAAACADPZEldsr41lc8BAADbAgAACgAAAAAAAAAAAAAAAAB8KwAAcG9wdXAuaHRtbFBLAQIUABQAAAAIAAAAIQAcOkaNtwAAAOMAAAAIAAAAAAAAAAAAAAAAAHMtAABwb3B1cC5qc1BLAQIUABQAAAAIAOZjSV1z+RMAmgUAALwMAAAJAAAAAAAAAAAAAAAAAFAuAABwb3J0YWwuanNQSwUGAAAAAAgACAC7AQAAETQAAAAA";
      const packageBytes = Uint8Array.from(atob(packageBase64), (char) => char.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([packageBytes], { type: "application/zip" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = "wnevesbox-jusbr-0.3.6.zip";
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
    setNotice("Aguardando vínculo. Instale v0.3.6 e recarregue esta página e a Central Jus.br.");
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
