import { describe, expect, it } from "vitest";
import { DjenSyncDeferredError, summarizeDjenSync } from "../djenSyncResult";

describe("DJEN completion", () => {
  it("keeps a busy service pending rather than claiming failure or empty success", () => {
    expect(() => summarizeDjenSync({ success: false, retryable: true, error: "DJEN ocupado" })).toThrow(
      DjenSyncDeferredError,
    );
  });

  it("does not treat accepted background work as zero publications", () => {
    expect(() => summarizeDjenSync({ success: true })).toThrow();
  });
  it("does not treat incomplete searches as absence", () => {
    expect(() =>
      summarizeDjenSync({ success: true, results: [{ status: "partial", inserted: 0, total: 0 }] }),
    ).toThrow();
  });
  it("does not treat failures as absence", () => {
    expect(() =>
      summarizeDjenSync({ success: true, results: [{ status: "failed", inserted: 0, total: 0 }] }),
    ).toThrow();
  });
  it("returns only confirmed completed totals", () => {
    expect(summarizeDjenSync({ success: true, results: [{ status: "success", inserted: 8, total: 8 }] })).toEqual({
      inserted: 8,
      total: 8,
    });
  });
});
