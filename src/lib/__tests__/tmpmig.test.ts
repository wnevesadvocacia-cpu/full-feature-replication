import { describe, it, expect } from 'vitest';
import { detectDeadline } from '../dev-server/src/lib/legalDeadlines';
it('mig', () => {
  const t = `Processo 1029845-60.2024.8.26.0506 - Procedimento do Juizado Especial Cível - Inclusão Indevida em Cadastro de Inadimplentes - Josiane Ferreira dos Santos Gonçalves  - Banco Bradesco S/A -  - Recovery do Brasil Consultoria S.A.  - Ficam as partes e respectivos representantes cientificados de que o presente processo passará a tramitar eletronicamente no Sistema Eproc do Tribunal de Justiça do Estado de São Paulo, sob o número10298456020248260506. Caso seja advogado: Ficam intimados os procuradores para que providenciem o credenciamento no eproc, caso ainda não estejam habilitados, bem como verifiquem os dados cadastrais constantes do referido sistema, promovendo, se necessário, a regularização mediante abertura de chamado junto ao suporte do sistema.`;
  const d = detectDeadline(t, '2026-08-10', '2026-08-10');
  console.log(JSON.stringify({days:d?.days,label:d?.label,conf:d?.confianca}));
  expect(d?.days).toBe(0);
});
