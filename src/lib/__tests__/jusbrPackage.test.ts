import { describe, expect, it } from "vitest";
import fs from "node:fs";
import { execFileSync } from "node:child_process";

describe("Pacote baixado da extensão Jus.br", () => {
  it("entrega o ZIP público atual com versão, nome e todas as fontes correspondentes", () => {
    const component = fs.readFileSync("src/components/jusbr/JusbrExtension.tsx", "utf8");
    const encoded = component.match(/const packageBase64\s*=\s*"([^"]+)"/);
    if (!encoded) throw Error("Pacote embutido ausente.");
    const bytes = Buffer.from(encoded[1], "base64");
    expect(bytes.equals(fs.readFileSync("public/wnevesbox-jusbr.zip"))).toBe(true);
    const manifest = JSON.parse(fs.readFileSync("extension/jusbr/manifest.json", "utf8"));
    expect(manifest.version).toBe("0.3.11");
    expect(component.match(/a\.download = "([^"]+)"/)?.[1]).toBe(`wnevesbox-jusbr-${manifest.version}.zip`);
    // Standard-library ZIP reader checks every archived source, not only the label.
    const result = execFileSync(process.env.PYTHON || (process.platform === "win32" ? "python" : "python3"), ["-c", `
import io, pathlib, sys, zipfile
with zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read())) as archive:
    root = pathlib.Path('extension/jusbr')
    expected = sorted(p.relative_to(root).as_posix() for p in root.rglob('*') if p.is_file())
    assert sorted(archive.namelist()) == expected, 'Archive entries differ from sources'
    assert archive.testzip() is None, 'Corrupt archive'
    for name in expected:
        assert archive.read(name) == (root / name).read_bytes(), 'Stale source: ' + name
    print('verified')
`], { input: bytes, encoding: "utf8" });
    expect(result.trim()).toBe("verified");
  });
});