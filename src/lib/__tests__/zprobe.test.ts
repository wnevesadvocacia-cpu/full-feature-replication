import { describe, it } from 'vitest';
import { detectDeadline } from '@/lib/legalDeadlines';
const cases: [string,string][] = [
 ['agravo_interno','TJSP. Decisão monocrática do Relator negou seguimento ao recurso. Intimação da decisão monocrática proferida pelo Desembargador Relator.'],
 ['agravo_resp','Decisão da Presidência que NEGOU SEGUIMENTO ao recurso especial por intempestividade. Inadmitido o recurso especial.'],
 ['emb_divergencia','STJ. Acórdão da Terceira Turma divergente de julgado da Quarta Turma.'],
 ['cumpr_sentenca','Intime-se o executado para pagamento voluntário do débito no prazo de 15 dias, nos termos do art. 523 do CPC, sob pena de multa de 10%.'],
 ['impugnacao','Intime-se o executado, na pessoa de seu advogado, para, querendo, apresentar impugnação ao cumprimento de sentença.'],
 ['contrarrazoes_ape','Intime-se o apelado para apresentar contrarrazões ao recurso de apelação.'],
 ['embargos_lef','Execução fiscal. Intime-se para, querendo, opor embargos à execução fiscal, nos termos do art. 16 da Lei 6.830/80.'],
 ['penal_apelacao','Juízo Criminal. Sentença penal condenatória publicada. Intime-se a defesa.'],
 ['penal_rese','Decisão que rejeitou a denúncia. Intime-se o Ministério Público.'],
 ['defensoria','A Defensoria Pública foi intimada da sentença para apresentar apelação.'],
 ['litisconsortes','Litisconsortes com procuradores distintos de escritórios diferentes. Intime-se para apelação.'],
 ['laudo','Manifestem-se as partes sobre o laudo pericial apresentado.'],
 ['replica','Intime-se o autor para apresentar réplica à contestação.'],
 ['especificar','Especifiquem as partes as provas que pretendem produzir.'],
 ['emenda','Emende o autor a petição inicial, nos termos do art. 321 do CPC, sob pena de indeferimento.'],
 ['preparo','Recolha o apelante o preparo recursal, sob pena de deserção.'],
 ['memoriais','Apresentem as partes alegações finais por memoriais.'],
 ['ro_trabalhista','Vara do Trabalho. Sentença trabalhista publicada. Intime-se o reclamante.'],
 ['emb_exec_trab','Justiça do Trabalho. Garantida a execução, intime-se o executado para opor embargos à execução.'],
 ['audiencia','Fica designada audiência de conciliação para o dia 10/09/2026 às 14h.'],
 ['adesivo','Intimado o apelado das contrarrazões, poderá interpor recurso adesivo.'],
];
describe('probe',()=>{ for(const [k,t] of cases) it(k,()=>{ const d=detectDeadline(t,'2026-08-03','2026-08-03',{tribunal:'TJSP'}); console.log(k,'|',d?.days,d?.unit,'|',d?.label,'|',d?.pecaSugerida?.peca,'|alt:',d?.pecaSugerida?.peca_alternativa?.peca,'|doubled:',d?.doubled,'|',d?.classificacaoStatus,'|due',d?.dueDate); }); });
