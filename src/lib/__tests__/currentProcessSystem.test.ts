import { describe, expect, it } from 'vitest';
import { currentProcessSystem } from '@/lib/currentProcessSystem';

const cnj = '5004488-27.2023.8.13.0079';
const resolve = (events: { content: string; date: string }[]) => currentProcessSystem(cnj, events, '2026-10-15');
describe('sistema individual atual do processo', () => {
  it('identifica eproc pela origem da publicação mostrada, não pelo padrão TJMG', () => {
    expect(resolve([{ content: `Processo: ${cnj} PROCEDIMENTO COMUM CÍVEL Nº ${cnj}/MG AUTOR: MONICAADVOGADO(A): WILLIAM`, date: '2026-10-05' }])).toEqual({ sistema: 'eproc', date: '2026-10-05', reason: 'evidence' });
  });
  it('não usa o padrão do tribunal sem evidência individual', () => {
    expect(resolve([{ content: `Processo: ${cnj}. Intime-se.`, date: '2026-10-05' }]).sistema).toBeNull();
  });
  it('não herda sistema de processo que apenas cita este CNJ', () => {
    expect(resolve([{ content: `Processo: 1009775-68.2023.8.26.0114 eproc. Processo citado ${cnj}`, date: '2026-10-05' }]).sistema).toBeNull();
  });
  it('prefere evidência mais recente a migração antiga', () => {
    expect(resolve([{ content: `${cnj} passou a tramitar no PJe`, date: '2026-09-01' }, { content: `${cnj} Sistema eproc`, date: '2026-10-05' }]).sistema).toBe('eproc');
  });
  it('não confirma migração futura', () => {
    expect(resolve([{ content: `${cnj} passará a tramitar no eproc`, date: '2026-10-05' }]).reason).toBe('migration');
  });
  it('usa destino de migração concluída mesmo com menção ao legado', () => {
    expect(resolve([{ content: `${cnj} migrado para o eproc, anteriormente PJe`, date: '2026-10-05' }]).sistema).toBe('eproc');
  });
  it('não decide arbitrariamente entre evidências conflitantes na mesma data', () => {
    expect(resolve([{ content: `${cnj} PJe`, date: '2026-10-05' }, { content: `${cnj} eproc`, date: '2026-10-05' }]).reason).toBe('conflict');
  });
  it('desconsidera publicação futura', () => {
    expect(resolve([{ content: `${cnj} eproc`, date: '2026-10-16' }]).sistema).toBeNull();
  });
  it('não confunde dois sistemas mencionados no mesmo ato', () => {
    expect(resolve([{ content: `${cnj} consulte PJe ou eproc`, date: '2026-10-05' }]).reason).toBe('conflict');
  });
});