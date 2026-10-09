import { describe, expect, it } from "vitest";
import { pendingDjenEntries, djenRequiresCooldown } from "../../../supabase/functions/_shared/djenImport";
import { djenFailureSource } from "../djenHealth";

describe("DJEN processing and failure attribution", () => {
  it("imports the same official publication received from DJEN and Jus.br only once", () => {
    const fromDjen = { externalId: "djen:hash:official-act", source: "djen" };
    const fromJusbr = { externalId: "djen:hash:official-act", source: "jusbr" };
    expect(pendingDjenEntries([fromDjen, fromJusbr], [])).toEqual([fromDjen]);
    expect(pendingDjenEntries([fromJusbr], ["djen:hash:official-act"])).toEqual([]);
  });
  it("recognizes the same official hash stored without the historical prefix", () => {
    expect(pendingDjenEntries([{ externalId: "djen:hash:official-act" }], ["official-act"])).toEqual([]);
  });
  it("preserves different acts even when their process, date and court are identical", () => {
    const metadata = { cnj: "1003778-63.2024.8.26.0084", date: "2026-10-08", court: "TJSP" };
    expect(
      pendingDjenEntries(
        [
          { ...metadata, externalId: "djen:hash:act-a" },
          { ...metadata, externalId: "djen:hash:act-b" },
        ],
        [],
      ),
    ).toHaveLength(2);
  });
  it("skips already persisted publications but preserves every new identity", () => {
    expect(pendingDjenEntries([{ externalId: "old" }, { externalId: "new" }], ["old"])).toEqual([
      { externalId: "new" },
    ]);
  });
  it("keeps all publications when none were previously imported", () => {
    expect(pendingDjenEntries([{ externalId: "a" }, { externalId: "b" }], [])).toHaveLength(2);
  });
  it("does not attribute a TJSP supplemental failure to DJEN", () => {
    expect(djenFailureSource("COBERTURA INCOMPLETA: TJSP: tls handshake eof")).toBe("Conferência complementar");
  });
  it("does not hide an incomplete DJEN query among supplemental failures", () => {
    expect(djenFailureSource("COBERTURA INCOMPLETA: Consulta DJEN interrompida | TJSP falhou")).toBe("Sincronização");
  });
});

describe("DJEN outage cooldown", () => {
  it.each([429, 502, 503, 504])("retains the shared expiring lease after DJEN %s", (status) => {
    expect(djenRequiresCooldown(`DJEN ${status} (pag 1): Sistema em manutencao`)).toBe(true);
  });
  it("does not pause DJEN because a supplemental court returned 503", () => {
    expect(djenRequiresCooldown("COBERTURA INCOMPLETA: TJSP HTTP 503")).toBe(false);
    expect(djenRequiresCooldown("Consulta DJEN interrompida: estrutura inválida")).toBe(false);
    expect(djenRequiresCooldown(null)).toBe(false);
  });
});
