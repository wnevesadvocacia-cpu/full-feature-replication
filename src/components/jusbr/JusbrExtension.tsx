import { useEffect, useRef, useState } from "react";
import { Download, Link, AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

export function JusbrExtension() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [notice, setNotice] = useState(
    "v0.3.3 · busca em segmentos de até 7 dias, com redução por truncamento. Vínculo/preenchimento da 0.3.2 confirmados; nenhum lote confirmado. Cobertura incompleta.",
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
        if (active && paired.current === user.id && m.owner === user.id && typeof m.message === "string")
          setNotice(m.message.slice(0, 1000));
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
        "UEsDBBQAAAAIAGaMSF1eYnlk9gkAAJ0gAAANAAAAYmFja2dyb3VuZC5qc91Z3XLbNha+91OczHRKaleC7TZtJ1Idj+J6t+mmccZ229nxZBOIPJIRkwANgJK9sh4m04te9XKfwC+2gx+SICW7dqZ7s76xSILAwXe+c86HQ5YXQuqTRLJCqzhKhETyQUW90VYiuNJAi+JIshnjCvaA4wJOUMdn0bnWhRpuby84zlFNxBVJRB71oXmwWJA7H07LLBtMkepS4kBikbGEaiY4ycScTjIktCjC8SwdFBLnDBeDweSbr76kO1/sDqbTp9PBU/zq2WDydJoOps+mz3a/oE+TbybT1jxv670IuxHYA4U8RQl7z2EJWl7DEiTqUnK7wZ+OX8VuACll1iPurRGsIKE6OW8GR5G5uRptZaihkCJBpRifwR5MaabQ3VcoGc1gD95IkTOFRKIS2Rzj3mhrWvLEbBvwKslKxeYYT3kPluDM1VRdWGPNDESfIzePR82UZgCxRsVxz+5m1RtV1pmHI1htUXXNE6iXUprqUsU5KkVn2IPlFvjlzBOEPaALyjQk51LkSJQWks6QZCKhGZlZ34sFRxn1I00nL9OoHzmALM5w39sKdbwEv3K/+nFkZhu61YmdGlZ2JjaFOLz7+ed+kF3XXDbcJOdUVYPtnZ7bWbU3TSfdnWk6UXZDwaS9Fpq8zDJribNF08m+YYRZueKJppOQJLC3twctMzasabj1o9t7uHbfcPG6wCFEb46OT8ev3p2cjk9/Oon6INYgqtGDVW+NAVsAq64nqPW+ccELms7wFK+MLzRe6SFETyIL+RpXijIvYgekAaCheM+TzCzVIr6WJZqbNqgC/D+ZW5clltjlWDUr05ibALG42JH7ZMp4Gl8aKC49bwKfVDy6JBK1vB5r+HYPvjOPuFjEvcDZT8zc4TbDPT2WVe59P7GnDNzc3MmiJ2ss0udSLOBQSiHjaDyRFF5yzXJ6+9vtf1ABp8YiTWHOeFJmNKVQUEmN+SKnkph0HhouUZWZ3mj7H7Pz4PvDg3+8ezE+Pfj+Dm5ODCGHzj2r9u7dyvtEXBgA/CUpUCqmNKbtnVaDK67f3ED0SmgEhbnZyZRJC8GvAlJh0uKcpSLcrVnSL5EK7rOd+3M7bxKvo74PonpUBVhGNSr9GAI74lZ8bcxxM3kqGkcblNxlm26hmXem0x9KNZEHpmbT5IKLRYbpDP0a/WBq/5ulFcfNX+Oaah1fHDxkVY2oRq0AM4X/dxguwa4zrOe1l4ZsZ297JKdFlU5YanOJRxL2YQmEkMs++GQyDFIJ/BW+3tnZ2YEVDOGy18L60bjb/5X8iAMaP8wBfx78jwb/fwZ9Q3wLfnzZD/N4F/PmVwvv958tsUJ7BceokWuq2ZwCLbXIbz9qltARMCuRq1xbSDSZhqZUkfd+XuOhFUwZp1lWFYlNgvDRBdH7IChMrWKXIZ/p847IoBmVuSKJRKoxjiw+kcnfi3PkQ/iR6nOS06t4nax9/5DxmBASrBS6oqqcNzew0+s1KNvcsNGQDKms7PDqZF2WJpR7qfGJikGh1ozPVNSPMqr0gciLDDUe8tRT2NafoE6FbK3rudpYFC9LlNfxEkqZDZtTiWVFllo6sEQoUqTFB/KhVGQit//iNFVT9FXtLS/QPQmjH+wLwE0ZQ6VvPwKdoNSCwN/o7W8UMmE0ARfg1htBIjFFnjDKFPCSJxSUeTehhS6l5aWDeSokxI1SEVO7QaIylmC804fdWiS7M9D9YsCIFBbqgJOD8es7BMCC8VQshkGUujuevR3/9PpQOa+ap7o2GPr8Vx2+WhEcHWNCpcRZiUDhALmWNDPLkokkcKi0LA0m2wqVxciCPEfJpiyhKTVAueDdWm35jcvSKCskgvudE5qmr4w64SjjODfGmsOhSftFdl3n2vuysOHAWfRm/PI46kfHhyenR8eHUd8i+O710S/RW8J4kpUpqjgnBt7aM54/nZOOk4X+lNrrWSnlj6zG0+Zy+19nO4NndDAdvF1++fXqs21GTIaNfaq2WirqdZTlz7e/G/0ogPH57ceMpWJNOj46LrtVxGHxIBCaI19TbTqlBpYgLoYuv9aHoiFEP1shbEjhhDHlGhWkaGUjSiZJZE7ujUluSVtlGpPWBeM9pczq5CE0frDh4lw1hLbL+nXhC7LshrrXnGAqv21QHRtFRgsecyyrI7Waqd6+i697Dtxr6DePOoWoxabvbz9CJizuoRskE5KYaityBG481vWRliKhEgTMPR8DFv6hG9q77D/SLU0iyusk1DeAx3dBYRzinXn2tg/JOSYXhWBcqyEsV33oJLuhbStYjy1Xocvuq+GmOtoSXhj00pf8R8ZLjWoIX+/cJW6aYPanKxPN8KJUpl7gLDdax/olh4QlmbDBYXMpNc/ECBJh6lApKWCggX41hci6q/rPeEqB8cRtsi4/j2Kh46BhYNsjFuoHVdyowz6TLzGvM5nN9Vubot13W44Px9/9M4j4P1+GuDsnCeVj3UmInbCrdEoz3uSGQLANYG3Ac6fhgsrxgGBp3m8dXsJEMhcsvbtD0I6qh2iDu0r9o1XDHa2vMKOt0W+dbmeun/Hm6OXr03d/PzyN+uGNk/HPpkb98NPJi2Pf8rivVn8iZ4Kc0WZQIrIMEy3kK6SqW0RDLWvoUUVU0D2qHvmh1cz7RIkcY2VQe//ZUhFBJ+/K6ar6yct8gnL13heeC7zuCoUDE/nbR+MXQDONRnSadGGiH5hJ8VLkRRhzlcU1XdZaWubFlKlC8Nvf55h13nT2t+HYJ0apZfA8ZG5dmNpjfc/YQhNStpszSi0p0Ak1/aTv2O1HySpN7nbHW4roD8OrbcTQxMfGamQ30mkf7H7l+wftDlqYuTrM7W1Ktw23qoAL2LZPzqx739pupK1LD1jLBkWYZhztm3nBsKa5bPcPngTjDDVfW7IRpl5yjTOUcfOcFPYTxc0NdO7Bt7C76fZz2DWYmWnHUtJrwpT9H86pELlTzOHbtq52Sd4YukkPP8T/LTEQyIjggTFluer1wbtiGAIZev+edFb3iO4rcP5zwidmK5+sPiUDbcodQd5wegVSVAmVmm6IMK9oTrRkfBbnrX5wfcazEwh+jolLPM0596mpiqOHlwSPnVUeYebfwKuc2F73PpFioSyr/B17w8tiR8sOCraPvU6rP+WQtd7paJ/y6rMRXmnk7mAs4Bf7tfaFuIIypzDHf9dGPbgJjdwa4kje73ywcsBUnnhYyyrFjF4Hcne3jocNqc6unYZeXfXcZ9Pqe4f53mtP7f5Ob+TkjfvQNfqEc7opOL5tKy56bjbXyxrBqmct9SLFdQXQGdHidd2DtB9vjXWbD7VYE992RSwQ1cde+93N3GojKvjY/Gi1MOwjZ4bZr70knOY+W/g+3Tow3YH2ULK25dqCpo9yoqnUZdHuozjJ1l5lbar/AlBLAwQUAAAACAAsjEhdxIbRYd8CAADqBgAACQAAAGJyaWRnZS5qc5VUbWvbMBD+nl9xhVHZ4KoZg8ESvJKmhnbrG7Gzfihd0OxLKhpLnqQkhNS/Zh/2Q/rHhhTHzcsyuoCJdDrpnnvuuUul0AYKFBkXIwhB4AyuWOH57caMi0zOKMuyaIrCXHJtUKDySI5asxGSAJieixTQHkP4GRYNAD4EzxmolhOVIhyEISyfgufnpS+Vio+4cEdjmTLDpahsPig0EyXaDYDUYcshrG5lzLB2FeKe3F1H36J48KUfn/YGt52LHgk2bb0oTm560bY57nauB9c3d+SBcpGOJxlqLz+hZl6gD4eHcPz9vnn0iR0Njx4WHz6W7445NaiNl1M5E6hsEoT4vksWwKh5tVrhVagLKTRCCGzGuIH0UckcqZoIw3OkGkV2tWTQW4AN24LchacoMn3HzaNHapA+nMDrDv7iukrTea420AKy5AQcanvPLQLQaAwXI21NqzWUviXW/qqqF1Kb/0S5y3Kn241uk+jMwdmpV3RGAqCU1oSVwY4alqhKSJlJH2HxL3R7AsinFgzZeM/zUDbAfVZTlQogDMOt13pR3L9MiJVH1Sr0kWkvpwp/TlCbi6wWxOp8hGbj3Fs4KDmVTy6AURMMoEClbV9l9qTerDlkUjjm7f+auWrBFsRGcTHyclpZKnlSPeYpes0A3jebTb+u7wpdhmM0uAHQOpQN67glWCkqqu0oqKeAlwcwsFq2mlJYjOf++gjI16i8veklnctBnHSSfkxWRL25lNW9XSW/mYSKg33ycuir+lh6LVtrY6jcTMkOLdI9j7pfB6edpHtOdkdWTSqEkKp5YSRVTGQy7/cvzuxofS2ERuPV7isircOb6XFQiL1av7JN1A/bPXbvFvuI0GgSnqOcGM+ra7lM/WBd9euaf818R1ubytpk2TXkWgFJjGrKM6lAY25JHHKVs5ffL79kG8bSIBQKNaopyyQUTDEbGIVhhk8ZJZW8ywA+NG2p7WaJzNWz7VT9B1BLAwQUAAAACABmjEhd/hIr/4UHAADdFQAABwAAAGNvcmUuanOtWN1u28gVvvdTHAPFioxpWgkKt5XCBEGcAF7stsE66Y0hYMecI2kacoaZGVrR2nqYxV4UKNAX6K1frJg/ckhLzhaoLmxpOHP+v++c4dkZfGglgtJEI9SkXDOOc2iE1KQCQkmjUSqoW6WhkeKWUQQ0f3mJpzek/IwUSsG1FJXKj0rBlYbvW3Uj3wqJUMDdEcCGcSo2SUWUfsdpBlxsoIALojHnYpOkqd0FRo7SxhKpoQC/HV7Dj0Sv85p8TeyRhkiFQVgKp/AneAZ/Pv/j1Hyc8FP4yzRaTGG2b3lulUrUreRw5/TOgOPGmpbY32muxeXV3660ZHyVpLmqWInJNIPn0zQD5DQ6wMXmqe2wMwp32REA8i8ttlaFxgzEhqPMgGmsQyjYEtzT3D6E46Jw21LQayk28E5KIZPJW8E1AcqWKJFrzCfpvDvvBVhVcH8P14s0V6LG5AsUr+BLzigURWHV5oymaQiFPfa0mAr5Sq/hVQEvTHgHJr1nFYFyjYzMoBQ3KHUrCTCuUUpRN4ySzsou9nme+1hYNTO4zvN8j+LM7TUmd2EjWmPdaDWDaWYkyu0bPYMp7BZRxEn5mYtNhXT1KOr0/xXzw97sC+GSVRpllAujzhjTG22dSZyzprjgbqDDPejdt4kMP+EEnkfhMOV/4oHEeHJucHDuAGP/wTN4Ac+e9TsGwjI4T41hziyFqxq5VkmDkgk6RK9E1VYGvteLuV+iZAvFCHVLISGpsEd7BG0n1oRQ6nTud7zctwU57TacFJYIKNkGg8AbkzetWif/I8D34LuLjVcI505fdsCy9AnZsPNFs4tLx9nb5V81FdOjKJsijQNkIRwpHZbqBSPw8B/OSgFatrwkVEDyfDqFRrIamRQqnQ9AWoq6qVCTHH5CLWpCCSBUQqOCRqJCeUuoUF3JuwTXjNIKn0hiKL1lJYRMYhqPLT89eD6Fs65+4AxepIdY/LrLcnx+nEhn75PZMUQzrhfv5knfV75ZO717sFv0ZKS2vIRSVBWW+iqgaUlKLeQ2M9xZfm4E4zoDRW4xA6yZNmA2XRkKSFJDGne7UBMeR9r2W8MMvQTHJq5sjh0LBfj2MDk7gx9wRcotMH66rNhqreHyQkFJOBcabtCobmUjFFKLXMt+jv5AIZHlOveiXEFUTloBx17nDdHl+pIa7nMLDVkhvILnzjoYmu/JMxg6C/Jew7U/bcO6gBnoNVOdR55mPWA6AZec4lfbHYzWSFpkysywpULkjx6bRZjB9SKDJeNMrZHOYEkqhSG23nqvF4ruoLPqerqYA9kQpm02nZED9G/WrMLQJGKj4eVIlm+8fer6nuW3vPc29ltCUpiVOLLOqTnpE/FkKnwkraRu8f0wKnGYvMqi2O+GwUL4yJbPoJTbRotcEk5F/enT5UWShqR16TGJ8OU0A95WVQYNcsr46oqtONGtxH7dJGQ2zoe1ahHVostbl004lK1hwIObYW4Ke1xOwcM1+fkDqi8tU8Yn+MNdrNKx0w7IeB053c1DfPtT45ztzkZPQmB3GTQPv64YjySTFe7ynztPtNxGFeIctmDytBTo6BGmXEF4Cmul5QDDRlEuh1zk9jxCz5768Vu7yNrK0bKNkPaN7OwcV3YrOyhNqUBiZk8ZY8Lk0S7mpaBoh6/Jx58+/fXtm4/vLiahjdod+5J/kNBGDfij7boujbSVhGtDpq6zzh831mx/Mw7ttgfzmlS3qKDwBGgHhUGmxgdChZjJLOC6K5tFV2xOVukjO6i4zGAwz3OnOlLwFHf3IHTHrqeLvYjezyVPYzIgbPLmlikBVCgYjDYzkEjbX8zl01jx8G9BxRz+QThWBPjDbwJKlJotWUmiO0kA8G5vt078jfhQl47HtGO/N79FyZbMMMWgNgIxnDXEQPXhn8Ykw2XmVqFm4VqNCkirkWtjp1CgsLY38Id/8ZL1dsdDQNT/7+/NreH3k2sIuQt38MA1+QHcBk3LVv/LwsR/2qNsdCMYipRIaHS6i76NnD9zfw/Hb6Qk25wp+z/xE70UG5Wax2GrXQnX0u++C5O/ub1sLbgNjaSjBPyd/MKEjWcp+JLJ2udAtIBKy9bCkKIqBV9jGV9ch40Xec54WbUUVTBQhV401vnB87LEBjUzJPCNO7Idz67ILcINLs07FVNmtvYrsoVWoQJFanQ9ES4vjGVaEq7ssLghyottG400f2T9uHea4B14YsL4yL393tUtFe0Bwov4Lvu289Hg6jnXXIP3UU43FOwv9EczwtgVc7/dQzKhnbtHJvjJHbBuqvBaMzAF2Ak1P4xztygtwDwE3RHZ8gC8vv4z+MzMjWFQuK9hYr9MYAYTs2tibgFECT6DyY+oCTWMMAfzOs4UE0UbxpUkVUck+QR23W3TxTPo4H2HNUGNnI/j2vdt14ot8dqBp4tNJJTjV90DbvxmqB5wneNgUZv3ioNr5f6eMg6Ze8XhiSvqacizR8ld/M6hse84B6eMIY0Zf5PBND9w+QdWM41AMQxk6sB927m+y4528yMTTr1tUCxhVYkbUn1cM+VGlJZTXDKOdJJGz/L4jWv3fX70X1BLAwQUAAAACABRdkhd3FPiDGEPAADKKgAABgAAAGRvbS5qc9VaS28cOZK+968I9QjOzFYpq+zpmVmoXBbUfmC74bEbtrsPI2lsVmZUFW0mmU0yJWvkOi2wP2CPe2vMwdhDnwb7C/RP9pcsgo98VJVlA3MawLCymGQwGI8vHszxGJ5LcQWFklYrYUBjrbTFEhZaVWBXCHUzF7yAR5xprmChdJXDMwUlWsbFuFRFU6G0ILh8Z/KvCiWNhR8aM9ePVAUzSNMMZg/g+iugTYwFi+8tzAAFDacojnMaeaikJTIfPkCSZLnGWrAC0/GZORgvR5BAkuVW8yrNpi0lVhRoDJ8LfNWnSVsB8AWkeygy0GgbLSFJaGFcWqj6yi3IC6EkPlMlplY3mMVJ9VX+S4P66iUKLKzSJ0KkySnTnB2ueFminH1N878+T7J8ofRjVqxSqUokBuhvrrFSF5hmgWLggo6aEnU3vO7OIlmF7QlQ5Eu0J9ZqPm8sponbV7A5iiQjEaW3zBBYzq/8NJKkqQW3Xo5ZXrE65SVtMZRdGtVIVB8LpMfvrr4vU15mWZa/VVymPRUQ7dM8z4kNt6dxI+fZudthSLu3nGZtbIyip9AL7l60ctjbQwF37gR5PBQcpX2BhTVplguUS7uCBzChGfRaVXVjsXxprwQS3dyR44LbK9ibzSDxiku6/RrJf2lou5RbrMwI3GG8vToDcsNxK6JxNwO70uoSHmutdPqGzFYrgbB/7daugTUGpUVQDbBqfvPbslFTQGN1YxvNQN78XcEFE7xkJcvfZNNoGW6r08n51FvFopGF5UqCKVSNadazaqEKRq/ymtmVsxt3unGB0momDgtVNZIXrFBokiG/yUM/Z2zQGOKEy5KbWsmb3y5Q5PCE3XxkINSSS6iYbJggS8ApxPn4vuaaleEcBWrLF7ygoySt6zgnZ3MDM2jNauBLafI7ev+6z+jrWisyjIZxE0k5F6aZG4d43EqzRFMoucKCl+zIgRjjEjWUCGzOTFTGNnMwC8pPyY5pj13uTpqdfW3ZnNz8PF9wYVGn3jaDrZKhkQGO//qI3/xKCFkygj/Lbz6y/THPLRqbkpZoZpaNINkxsX9iy+a7fNs4zrBMMq9uQp9N7TruuZIIO/boKzSHR6rixc1vgiuQjSwY3PwPsDlqqzaERYB/mybp/et5Ywr2unQh4vVb2rBgWzJ3jv1JOsPFry1500Aue1HitKODknbEEc82hPFE6aoRTgxjT21g7dx0Vq2aLQ9FvWnYwU+vnURG4UDOV9d9f5031iqZOjQYgVbK9k4d3TjQ6pkgTdxhgp7aKFii//V5Y4zmllv1VBVM4FN1ifohM5gmtT387kWSwWw283B3y6QsImI8pddlyQ0dvuzHq3bsw4dPhK84I+ztDXgAdZrJZQd1AfgGUZvJkpfMImELSW23NTnJ7TYo+CbK0lhmG/Mljn1WHpyZbw7PzDf+6WzsH/fH3rldTCfnpul7xBalFSsuSo3yPDeqwtT9JOpfSM7Nz7KYPYzHlHLVbMkls0rDw5cvocQaZYmyuDqCBRMC5qx4B5YwmhUW1NygvsASCtVIi9qlHnlPmJSlkBw7ocZAd9wX9NHnBG1qJkclvxjV/xKijPmfF0obBpw0RpC4GFIqDaWKIDoEMtlUc9QkuJDLOUKUWtlilY7PyoPx0idaz9zMweJTY5m2I0BZjsAqy8Q5zCLJHtS5ac6VZAn3of3plsB9Gt5AuxdoGkGcwwX7G1fw7OY/ntOmC64rGlUNtEfj8uLmV8HLTaiXPosOCJbU+uYf73m1AeSCmf6km/8WllcM6ptfyTiHc5l9LB1K0P+zmWe/O6Z/TdFsby+iQ0pM+ERx11vafRPoH8ZzIcyVvflfNBBZH2+wB1wSZ9xQrYFmCoWimEewz0mNWlU134X5W3obeWlt479GVqY1aq7KiGReGNcxZMCsxbbwiuwwgF9ffCtkpTe1kKQI3OF/dhUhrVCiqaRf5YGNzJDMdECWyxLfewhNfvRZl0pGyStCa8lEMkoeMUu5FTxy0dLl0H9jNx9v/q4ST3NF/hfYyxdclt8TzfTCOf3nos7qtojTC/iBT+/1nEhzuA+TLfWzOd58ZGKlTD8fVE67Au0nVBskry6dIM794EJpSNs3oBbwSanrKHWtLknYUdkbyYpWl1nmXI/LBv0uLQihEFG7Wl3u2qVsdYtCOJ1OPX23NgD2J+nLty1M0fTTINHTyfn5oMR2FXbSw7DrP60Pz8rre+uz/Ky8/tb9cY/tyDg7zqlaGWxIEWP3jvdox0D+r6kjlJ2NBw/frrP9cVBOD6a13U3x7vl5O9lLRL51SaFjgh784g8fPJWuYPy3yYYFPeVyRemxoMyOlWwIC4WqajKj1nJaPzIKZvBm/5p2PP39+fowPN7rHu+er98MV9VMG5c6SbyER8xi+mb/mhu1fjWZHLl/f3kzPJiPIzk3T7jkFlNPgVKsV7yiDgOdMQxa9f3L5y+t5nKZZrkRvMB0MoK7E181cKM2zh5dXTgZxMiwIYId7uN58zhHwToladwHP5C3AYtGH8RRilqfDFtqbshb1RFZEaPCxbO0UFTnMXjLJOVvNZpfGm76iTk4L87rxqzSazL6kTPEI9p8FExoHeYSVHvW3ZpeZa+JPTgEHZg/gLt0gP60B3B3MtkVfJZYtTI0UPIL1MvYBNgZjrcDDO0zAsOXktlG4xH88PL5s9w4TfLFVXoa+Bo5Pkc691GIlp1nIx+fjiLzLlA5SKahLmjRr170Ci/hfjeMsoyjBNVhfEeY47JurCvFRuBwZKVEiTqjo2wVN65puI1ujsbnkkYqUK5qDDUDvrdJ1xHqlRg9HkKY6XM15HE6PIpB+zMTDe04otZMg/1uy3ZtQxGemqZbcaiqNxoq09Zcb4tBBq1PRZ/P32LhWnDPL+WPWtWo7dUjNIXmNRXJ//7qz0+/J5mFDl1ea2UVSWcEiWM8yY5zg7afSTriO1l1ha5pqN/bN0kU+UIVjaH0xK/OCyZETzrtPDoqYfrjC5Q2JUDzT0GzI7iGeTOfCzRHQOUerLNseuvCYkVp0CdWxlJoLhoNFdPvDJzIZSOY7vrXzIBVTbHCcgpSQaGxRGk5E95iDTCNEHspvhxCkRPFmHsFpbujOmTwTxRRXDGCxbufqX/H7RVh70CwPzOhNGh8i9yBmvQN89CGCCLuCmmrqfVCRhga2MlJZzEardJSNVA13CrqzAeoNIDUrmAVPb3ncy4JPg2BE9SaV8i1Mjk8ZIa69AbfImhccMk0MHCdmhEs2IXS0FiX2WlQjdXKAPkhrR2W5YFLLNvSPHj4ZwrDehRLQ/Jxl8Xt9PBY9PkSYSCSVl4tM8wY1PaZsq+2uHLNs26UoMiLmRyP/CsoaSCnIy+RsO9tsd+TyQvX5Ifk1Yufnj08efX4UTINNuDee2zpVCwUK7lcUo/Z9ZU/I7OK2cNaq6VGYw7nTP+Om9eBREgE49s5Czm+E2wQqZMXM1ey6CR2ybhNmXseue57TfHhglPrgE4iG0GNKnfv07J5vY5SFWh9dHFJy4IJg1M3GGTTGx7UGKbGokcvdK7dSUg3HUlybwIFg25OeJEN6Ps5656DRv7v3Iki3nLG75xiGQEvVxoYlyWDgmmNSyZL5TrvivI9qDVSs2S7jR2aKGQ8BFJ/bqwzzedhOA3HDGvi7Dw8dLcq8SEAN8Gba0s85cZ6gBuBaeZWI8afLMa2DgH9LlZftaWGVyshdeCkqyktr1A17lYsyuoY7t6bTCYTOAL3dyN5R1YKLskkKC3NpbpMMziIhLzSTezjJkkY4N6KJv4n1ecvXWetG9PIjJJ+TdjxcsUFQtrb5367f1dIQe9U3dCG9ns0DvvbP5gRIFK+1pGDYObpm5Nlw3RJZuD9/wj2r6NJHkMSrIR05TJTZxwqgSNIWLey55zJegqCV9wiydi4i52BLDo2u6P4ZLS7rIynogu+yMydOz1HoKZYZ+3Dk/XlkrU6pzDmGnn9fWEnivbf922sbyM+BlG3groccZPjPPQ7+iRCi8fhTerXbXAc5wSbckm4m5e3aTBheGtymy+nrfH1hNsTarfDwEb8ogcz+AMZRwhlnvaQ/7UHpb7J996voaAMBlLHJO0SL9U+tPdTH9oLmQ+xvAmdScwrNIYtu1sLnHaO0r6dDh2uO9ttvDFCfIdXP2pVcYMkfiUu3N208VWjamwcpepwErOrzigH15z71z0QCcBqsIKCF2LgBx5KpcX/+8//ijehlH6YWhnLIFSXgJVzE+dQJxdM3nxUnp6ShWjcnQxZvVaEyTSbJq/3r4OEjiE5ggQOosSOICEH9KWWv5nsSi14sQPmY4m9BkqMhLiC6w6+S05dJBngNMbzNqAWGsmhKDfmcjkK1e0tITQWeUGy/m4Jy4D0Ecpd1DbIdLEil7ADIIwtRHcb1+8gbswIt6gwGxRoCQHhZDI5nExy+pvTH/fU1dBtyHOXo4PVPz25e+/33/7hj386oYK2/bW91lfOG6tdh4FLXnAmtpe4SnPHAqeW/vRea851eNQCTvvdhqgHql3Ph0BzS+OFSO3svETo2KNbhutvQzvM/x+vF2ixv4j851s0sUPjaQ7ymB9856NE1xkxXZOm1wHZDCaDPsygAfNZ2nSnv0E7COL05PAv573zBw/IFZu/bhZeEu5SZtcEf8mxmaM9P/lu/NOT7khmsG93A82cX1EJ6gXkLx27xgCNJnDsTcO1kDB8+ZIcus+JLlAbTOO3KOP+Lm39H5zH9UKn3bBi8xEMzwoHsONsO0gG0/RHiL/6yqGCuGtAUKcmzHXP/cbZlrM5qOhdxThY1omnQCnhAtL24sTP3pki642vQLY1EJOIDtu2vKtotKbvt1pkck2fTW/yfh7m3o5LvQI8SQZxmdqKG3Q+iVA9Kl+gwc9tM4SyHu1b9PtFNAPabVPcsoKNbxx8wQ6M+mfUGviCvm347KyfK7gS0WvW20leCF68S7NRm/E9aNMvj/H0LRSVMTH4tSayjoFwE7upFKjZkozo7tQ/uZtNizn98EMHB1ngya64yalL2QW59TBWuhyUkq+d2WyX2XX3cdNNEp7+Vpyd40Jpn3L2Fw9uScN9nWNxiJTDq8wNjf0YbiapM8Pcx2mUmVCRaujKmYVkCE3tFDrQ25ayaIMvUtXcHYgsyHWFXXP7zp04z/d4e/P8QDfBNcEJQq+obe52UJe5U/eD2bDnT4viu/vtuwGABR20PeW2B+4TKzoIK0ceR2jWOiMTWAo1Z+IVWUXv69L4OP3q/wFQSwMEFAAAAAgAhIxIXZjMjCDZAQAAlQQAAA0AAABtYW5pZmVzdC5qc29urVLBbtQwEL3vV4xyrBpv292q2nADTpw4wQGh1cQe73rreIztbCpV/RjEAYkf4M7+GIqTbUSpaEHkktgz7+XNm3c7AygadEZTTOs9hWjYFRUsTvuCw4aKCor3jvYUX/IN/PgOr9hpCodvThqEN20UdShy94QuzsRCLIZbRVEG49NYeUvxU2siAoHHjXF4+Hr4wqAYXpvD52AYPAeQ7FJgSxG4jhT2qDieguQGAiVuUKGAd2iNGuGB0IInp8glegGRGpBmkCgGGZ5CY2KvLxYVfJgBABQxccAN5Q6AAi2GJh5PCetYzAA+ZvyWY1o/SrJNycdqPu+ySTXfCMnN/ORIc1/uOvFEi26tLTVhagOVgbw1EnvfhOU91pYEev87yqjSB9ob6sqyvrpc4NnFean1UpdLulyV9VKrUq/06vwCl/Kq1n9m8xwSWkW960ZyFF75ndjlNc9PJj9qlNebwK1TRQW3o50ZQ+uOwzWFfttTl9hlM+8yGOUYhxGoSGNr09qzb32Pyx9imxo7gfpMkEvrIU7TAgaOHOMktzQV/nKu/smzZdzuAY/kQP0Mx4ZeNTcPboafjKNmvvzO+p8rtHs0I8+M0r/H6X9G6kkz62DUJtv5q099umZ3s59QSwMEFAAAAAgAhIxIXWtoGacOAgAAKwMAAAoAAABwb3B1cC5odG1sXZO/bhQxEMZ7nmJY2rB3yRUgZW+LJBQg0hAJSjSxJ7eD1jPGHp8IFRUPwBtEkYhASomQKNk3yZMg3x3iT7Ne2Z/G3/y+cXffq7PLSDBYGPuufmFEWS2baA+PXjR9F8gQ3IApky2bYhcPHzd9Z2wj9ccqF5Smr+IY4VnJ7XmC9bxdtItutlV05+ov+25Y9K+E1pSP9B38/P6/dlj0XQT2yyYbWslNf4wp0QrF692Hz90s9l3sj0p2CBQg0yqQmGbwBGjTF3gEnjHvgWM3Kjzg/HpU9Cyr7fH+wTwDQSJfppvpWsEr4Jpz/cmwP59DTByIk+YWThhh+iHsFCwVcegVWIxS0hAJnAZwek7JSkJgcRriSIYtnG28A8EWCyfAlSYEzzmqTLdr4lztPxXjgNPN9I1yCy+nW3Fl1FlMROIG3rQGlcwBOJULTgGrzUijgrGVEdMhCMlQAoxq9JeqhSfZquE1vmcFAg5Rk9XLrhWiiiHgbo0knsSqhzMKcKKB3XQ7su6BS+SphsoZtIDjbcTtLojnumIBqQWT4Qh3Hz/BKcuAudIpwm7XHcSkjnIutVBVnfB0lVjBb8bFeLrBFk5RjGTAf8DUiP6MDFbe2O7I7gZu0FSr4SEkMhJD4zVmwEiCGUjeFqwkh+lqg6kS/N3xppHsEkeDnNyyiRpLbN/kpu9m2/2+m21nd7Z5Gvd+AVBLAwQUAAAACABTiEhdHDpGjbcAAADjAAAACAAAAHBvcHVwLmpzNY49asNAEEZ7nWKKwEoQBtcxdiAmhcF1mmDwIn1Igt1ZxzMb/Kfz5AQ5gS8W1sTdV3zv8drhkCJYLR18Dw6p9YF7WP3pIlR9D/fsvjIy3LZhGyC1mjfQYkmXiqhLbY4QK8x7QJlvp3VXu/LK6ho2HG2VxCBGC9o9Xe48/9vpeiX3MUqbAyhHT984EyKtxcbobz+3Xyi7iTbJoFTyRqU9pIMY9IUeunviKwdIb0ORzibezaupmVd/UEsDBBQAAAAIACyMSF2qpN5HwAQAAJUKAAAJAAAAcG9ydGFsLmpzlVbbjhpHEH3nK8rSSjMjTRr7IS8gEmEWx3a8Fy2spciydpuZAjrMdI+rexYhdj7GyoOlSH7MF/BjUc0NMHbsPDF0V9fl1KlLtwvX+SxREZwrScqA0clGwKWBzJCTCUSEMWqnZGJD0OjWhlZA+CFH6ywYAjJrkJFTRlvRSdDBLLcbGMBcJhb75YlTKVL1qY1Tc4XxsQC/f8CrtWaxyGjrgJAdgAGkaK1cIAx+gWhJJkVBuWaNwqKOL6pbfwtuk2EPvOurm+nwzd1kOpzeTrwQDCvtHVoIW5VFICLpoqXvB6x+WwT9jrQbHcE812VIYCOp/TSAbQdAzcHn4ALYglxL1TjpeyOj50i7v3WkJPy5+wiYgtSxTFE70we5yCXFCJKxiSRIl8tEeEEfCF1OGrZgVr0KkNa7Hvy3WuFB0YeiAw3gjnLsHwbK4Iky/n4HwNGmjALgdW5ndG5SYSOToR/wbRXdk1oeHh/hyZBIboSy5a+fCovOKb2wQXm7/y8S1Au3DMAtmQtjIkO+93b3WUd5YrpXw+egdKxsZvTu8wMmfZAzkvCKkyh3n3b/oGUsSifmhsCvCFCrBzOHQ9tVCACV0Ao58vuzbS0gjJzd5fPi+EDn6QypuO8fvSVklyzCoM7mj9Br9HI8+v366tXl9O638XTPrxq4sPSIeVRZKkFtDP0qzOoYpf1NQ8nHR/Bu0JlUxvIYthYjAC4Z66Rj1xsVIlpitMqM0u7IeCX3+Fg9EHOllV1iHLQKtkC57kFEm8wZQVLHJr29fXXuByFkJQ+fhWARdQ/evQ8hQ1Im5oDXSsdmDcUxqowaI1qWUSY3iZFxWVy11AH6eeJ+DHshRK3pe3jvEc8T91W8y/NDtF+oRHapgVzv/jLs4VwR/z8AvY3zqPTvr9F+yJVl2OBc7T5yDz3brnBTlNVda5WQ7T4ulJZwtq0SwdAWAi7QyVjGxh5bTiEyMySXE7PA4YJkIu6DYxfKOh4ZQhGZJMHITXDBrcH6VZIY9rbWI0Lp0K/LosljWMcRhBUfwn2WWjqxGs7HV4tgMnw79sJD6SLYK5lxdz19//p28vzm7vlwOnrphbVQEbS+fAPoCkALJ0BzLJEhUrG0fUiMQ1u33BLHCtHdJ8b3/PX4UsCoxZabsjOWNaRSY4SgdGTSLEEnW7y5x8Jxq+ZeG4LMOb8O4wlKipbVcUWUAsrJAj6eTIv7o7bO2SUyaaZi2YOzLTbkLO6/Nx9a0WYQzJWWSbKB7fEMhqJTdL4oMKPr8hIyjt8o61Aj+X4awh3niiuLMEs21WCsh18qOIHwZDAAbzIaXnpB7SBH/GBU3IxL4Zao/UpBG0Q5nzpcq90uDO0K3BIhk4owBt4qkMAZpiE5WC9Rl/e5RQKTobZdi8xxWz073FlEpx3XhDLe+F+O672T5RA8HYBV12h2E87YwZ5SzdUyvP+xgNyMh+d/eCcrxukCxN0LipYw269JdIqOxjVc5E5ymFczi/TA+aqVRglKmqoUTe78ctsK+tXWBQMepM1VCU8Iz35++pSNBsJUmvzYRDm3DtF8jBPknxC2YPOZI8SG9NFSJSVj2ipwjtQsd2hPTl6oxHG3fudJUvKnKoMYe+/Llv0txzr/AlBLAQIUABQAAAAIAGaMSF1eYnlk9gkAAJ0gAAANAAAAAAAAAAAAAAAAAAAAAABiYWNrZ3JvdW5kLmpzUEsBAhQAFAAAAAgALIxIXcSG0WHfAgAA6gYAAAkAAAAAAAAAAAAAAAAAIQoAAGJyaWRnZS5qc1BLAQIUABQAAAAIAGaMSF3+Eiv/hQcAAN0VAAAHAAAAAAAAAAAAAAAAACcNAABjb3JlLmpzUEsBAhQAFAAAAAgAUXZIXdxT4gxhDwAAyioAAAYAAAAAAAAAAAAAAAAA0RQAAGRvbS5qc1BLAQIUABQAAAAIAISMSF2YzIwg2QEAAJUEAAANAAAAAAAAAAAAAAAAAFYkAABtYW5pZmVzdC5qc29uUEsBAhQAFAAAAAgAhIxIXWtoGacOAgAAKwMAAAoAAAAAAAAAAAAAAAAAWiYAAHBvcHVwLmh0bWxQSwECFAAUAAAACABTiEhdHDpGjbcAAADjAAAACAAAAAAAAAAAAAAAAACQKAAAcG9wdXAuanNQSwECFAAUAAAACAAsjEhdqqTeR8AEAACVCgAACQAAAAAAAAAAAAAAAABtKQAAcG9ydGFsLmpzUEsFBgAAAAAIAAgAuwEAAFQuAAAAAA==";
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
  return (
    <div className="space-y-2 border-t border-warning/30 pt-3">
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={download}>
          <Download className="h-4 w-4 mr-1" />
          Baixar extensão v0.3.3
        </Button>
        <Button variant="outline" onClick={checkNow} disabled={!user}>
          <RefreshCw className="h-4 w-4 mr-1" />
          Conferir agora
        </Button>
        <Button variant="outline" onClick={pair} disabled={!user}>
          <Link className="h-4 w-4 mr-1" />
          Vincular uma vez
        </Button>
      </div>
      <details className="text-sm text-muted-foreground">
        <summary className="cursor-pointer">Instalação e validação</summary>
        <ol className="list-decimal pl-5 space-y-1 mt-2">
          <li>
            Descompacte; em chrome://extensions ou edge://extensions, ative Modo do desenvolvedor e Carregar sem
            compactação. Para atualizar, substitua os arquivos da pasta e clique Recarregar.
          </li>
          <li>Recarregue Intimações e a Central Jus.br; vincule uma vez na sua conta. Mantenha ambas abertas.</li>
          <li>
            Faça login com seu token exclusivamente no portal. Abra Minhas comunicações processuais → Diário da Justiça.
          </li>
          <li>
            A busca aguarda o ciclo de carregamento por até 120s e valida filtros, datas e contador. Divide períodos em
            até 7 dias; aviso dos 100 primeiros reduz a janela. Dia único truncado interrompe com cobertura incompleta.
          </li>
          <li>
            Não abra Domicílio nem ações de ciência para testar. Avanço e fim da interface confirmados pelo titular.
            Vínculo e preenchimento da versão 0.3.2 confirmados pelo titular, sem lote confirmado. Ciclo/segmentação na
            0.3.3, estado vazio e persistência/importação ainda exigem validação; ausência de tela não confirma sessão
            expirada.
          </li>
        </ol>
      </details>
      <p role="status" aria-live="polite" className="text-sm font-medium text-foreground flex gap-2">
        <AlertTriangle className="h-4 w-4 text-warning shrink-0 mt-0.5" />
        {notice}
      </p>
      {batchNotice && <p className="text-sm text-muted-foreground">{batchNotice}</p>}
      {batchesError && (
        <p className="text-sm text-destructive">Histórico indisponível; não considere a conferência concluída.</p>
      )}
      {!!batches.length && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left p-2">Conferência</th>
                <th className="text-left p-2">Telas observadas</th>
                <th className="text-left p-2">Importações DJEN</th>
                <th className="text-left p-2">Identidades pendentes</th>
                <th className="text-left p-2">Cobertura</th>
              </tr>
            </thead>
            <tbody>
              {batches.map((batch) => (
                <tr key={batch.id} className="border-b">
                  <td className="p-2 whitespace-nowrap">{new Date(batch.created_at).toLocaleString("pt-BR")}</td>
                  <td className="p-2">{Number((batch.coverage as { page?: number })?.page || 0)}</td>
                  <td className="p-2">{batch.inserted}</td>
                  <td className="p-2">{batch.pending}</td>
                  <td className="p-2 min-w-[220px]">
                    {batch.status === "running" || batch.status === "starting" || batch.status === "queued"
                      ? "Em processamento"
                      : "Incompleta"}{" "}
                    · {batch.error || "Aguardando conclusão persistida"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
