import { describe, it, expect } from 'vitest';
import { detectDeadline } from '../legalDeadlines';

// SPRINT JURÍDICO CRÍTICO — caso real reportado:
// TJSP Campinas 5VC — proc. 1027398-77.2025.8.26.0114
// Intimação 28/04/2026: "REJEITO TODOS os embargos de declaração"
// Esperado: classificacao_status='ambigua_urgente', confianca<0.8,
// peca_sugerida.peca contendo "Apelação", peca_alternativa = AI.
// O sistema NÃO deve marcar como "embargos 5 dias".

describe('Sprint Jurídico — REJEITO embargos de declaração', () => {
  it('REJEITO embargos sem termo de sentença/interlocutória → ambigua_urgente, sugere apelação + alternativa AI', () => {
    const det = detectDeadline(
      'REJEITO TODOS os embargos de declaração opostos pela parte ré, mantendo a decisão tal como lançada.',
      '2026-04-28',
      '2026-04-28',
    );
    expect(det).not.toBeNull();
    expect(det!.label).not.toMatch(/Embargos de Declaração$/);
    expect(det!.classificacaoStatus).toBe('ambigua_urgente');
    expect(det!.confianca).toBeLessThan(0.8);
    expect(det!.days).toBe(15);
    expect(det!.pecaSugerida.peca).toMatch(/Apela/);
    expect(det!.pecaSugerida.peca_alternativa?.peca).toMatch(/Agravo de Instrumento/);
    expect(det!.baseLegal).toMatch(/1\.026/);
  });

  it('REJEITO embargos com termo "sentença" → apelação 15d, auto_media (~0.85)', () => {
    const det = detectDeadline(
      'Conheço e REJEITO os embargos de declaração opostos contra a sentença que julgou improcedente o pedido.',
      '2026-04-28',
      '2026-04-28',
    );
    expect(det!.classificacaoStatus).toBe('auto_media');
    expect(det!.confianca).toBeGreaterThanOrEqual(0.8);
    expect(det!.label).toMatch(/Apela/);
    expect(det!.days).toBe(15);
  });

  it('REJEITO embargos com termo "indefiro a liminar" → AI 15d', () => {
    const det = detectDeadline(
      'REJEITO os embargos de declaração. Mantenho a decisão que indefiro a liminar pleiteada.',
      '2026-04-28',
      '2026-04-28',
    );
    expect(det!.label).toMatch(/Agravo de Instrumento/);
    expect(det!.days).toBe(15);
  });

  it('Embargos opostos (oposição, não rejeição) ainda devem cair em "Embargos de Declaração" 5 d.u.', () => {
    const det = detectDeadline('Oponho embargos de declaração', '2025-04-22', '2025-04-22');
    expect(det!.label).toBe('Embargos de Declaração');
    expect(det!.days).toBe(5);
  });

  it('Sentença homologatória de acordo → apelação 15 d.u. (auto_media)', () => {
    const det = detectDeadline('HOMOLOGO o acordo celebrado entre as partes para que produza seus efeitos legais.', '2026-04-28', '2026-04-28');
    expect(det!.label).toMatch(/Apela/);
    expect(det!.days).toBe(15);
    expect(det!.classificacaoStatus).toBe('auto_media');
  });

  it('Condenação envolvendo Fazenda Pública → prazo em dobro (CPC 183)', () => {
    // "Apresente apelação" garante a regra de 15 d.u.; "condeno a Fazenda" ativa o dobro.
    const det = detectDeadline('Apresente apelação. Condeno a Fazenda Pública do Estado de São Paulo ao pagamento.', '2026-04-28', '2026-04-28');
    expect(det!.doubled).toBe(true);
    expect(det!.days).toBe(30); // 15 * 2
  });

  it('Confiança e status são preenchidos em todas as detecções', () => {
    const det = detectDeadline('Apresente contestação no prazo legal', '2025-05-22', '2025-05-22');
    expect(det!.confianca).toBeGreaterThan(0);
    expect(det!.confianca).toBeLessThanOrEqual(1);
    expect(['auto_alta','auto_media','auto_baixa','ambigua_urgente']).toContain(det!.classificacaoStatus);
    expect(det!.pecaSugerida).toBeDefined();
    expect(det!.pecaSugerida.peca).toBeTruthy();
    expect(det!.baseLegal).toBeTruthy();
  });
});
