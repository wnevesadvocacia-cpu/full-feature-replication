import { describe, it, expect } from "vitest";
import { CNJ_RE, hasCnj } from "../cnjRegex";

describe("CNJ_RE", () => {
  it("detecta CNJ com máscara padrão", () => {
    expect(hasCnj("Processo: 5006940-82.2023.8.13.0637")).toBe(true);
  });

  it("detecta CNJ sem máscara (20 dígitos)", () => {
    expect(hasCnj("Processo: 50069408220238130637 ")).toBe(true);
  });

  it("detecta CNJ sem máscara no início do texto", () => {
    expect(hasCnj("50069408220238130637 - decisão proferida")).toBe(true);
  });

  it("detecta CNJ sem máscara no fim do texto", () => {
    expect(hasCnj("Vide processo 50069408220238130637")).toBe(true);
  });

  it("não casa quando texto está vazio/nulo", () => {
    expect(hasCnj("")).toBe(false);
    expect(hasCnj(null)).toBe(false);
    expect(hasCnj(undefined)).toBe(false);
  });

  it("não casa números aleatórios menores que 20 dígitos", () => {
    expect(hasCnj("Telefone 11999998888")).toBe(false);
    expect(hasCnj("OAB SP-290702")).toBe(false);
  });

  it("não casa sequência de mais de 20 dígitos colada", () => {
    // \b\d{20}\b exige fronteira; números colados em sequência maior não devem casar
    expect(hasCnj("123456789012345678901234")).toBe(false);
  });

  it("CNJ_RE.test é equivalente a hasCnj", () => {
    const s = "x 50069408220238130637 y";
    expect(CNJ_RE.test(s)).toBe(hasCnj(s));
  });

  it("aceita múltiplos formatos no mesmo texto", () => {
    expect(
      hasCnj("Originário 1234567-89.2020.8.26.0100 e execução 12345678920208260100")
    ).toBe(true);
  });
});
