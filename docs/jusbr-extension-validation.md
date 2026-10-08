# Jus.br v0.3.0 — validação e limites

## Entregue
- Vínculo persistente por usuário, restaurado com identidade atual do aplicativo; lotes de outra conta nunca são enviados pela nova conta.
- Fila local antes do envio, ID imutável, retentativas com espera progressiva (1–60 minutos), confirmações persistidas no servidor. Nenhum bloqueio entre páginas.
- Alarme local horário de conferência, recuperação ao iniciar o navegador; alarmes de retentativa desarmados quando a fila esvazia. Não há novo cron no servidor.
- Ingestão autenticada; isolamento por usuário; histórico, alerta idempotente, reconciliação DJEN com CNJs do lote mesmo fora do cadastro. Resultado aceito/running não é resultado concluído.
- Metadados duplicados preservados como ocorrências. Apenas o replay do mesmo ID de lote é deduplicado; IDs oficiais DJEN seguem responsáveis pela deduplicação de publicações.
- Controlador puro de busca/paginação incremental em core.js: checkpoint antes do envio, retomada com mesmo lote, sobreposição de sete dias, histórico inicial de 90 dias, falha em página repetida/vazio não explícito/fim desconhecido.

## Adaptador baseado em evidência relatada pelo titular (08/10/2026)
Containers observados: #tabs_comunicacoes_processuais, #form_busca_diario_justica, #diario_justica_tabela. Aba Diário da Justiça selecionada; campos Número do Processo/Número da OAB, intervalo Período início/fim, Buscar; cabeçalhos Processo, Partes, Tipo de Comunicação, Tribunal, Classe, Data de Disponibilização; contador “1 - 10 / 29” e próxima. Não depende de IDs mat-input. Não usa Peticionar, Visualizar Detalhes, Visualizar Documento ou Domicílio.
O adaptador preenche OAB UF+número, limpa processo, define período e clica Buscar. Os campos de data só são aceitos quando início/fim tiverem labels/aria identificáveis; a evidência fornecida não especifica seus nomes acessíveis exatos. Se forem ambíguos, interrompe antes de modificar/pesquisar; obter esses nomes reais é a adaptação pendente, sem fallback por posição.
Pesquisa exige mudança observável na tabela e contador reiniciado em 1. Próxima exige início igual ao fim anterior + 1 e total constante. Contagem da tabela deve coincidir com o intervalo; três linhas iguais continuam três ocorrências. Falha, contador inconsistente, tabela vazia sem evidência ou ausência da Central interrompem e alertam. Ausência de tela não certifica sessão expirada.
Checkpoint por conta/OAB é salvo antes de enviar cada lote. Retomada refaz filtros e percorre até a página salva; se o conteúdo mudar, não reutiliza o ID com dados diferentes. Coleta simultânea em outra aba é bloqueada por lease local.
Janela inicial de 90 dias está ativa na pesquisa, com período fixo durante retomada. lastCompleteEnd continua congelado: avanço incremental só deve ser liberado após validação real e confirmação persistida de todos os lotes; não apresentar páginas percorridas como cobertura integral. Itens por página não é alterado.
Pesquisa e paginação foram testadas em DOM simulado, não pelo agente no portal autenticado. Ainda faltam: avanço efetivo no portal real, estado vazio e funcionamento com extensão instalada.
Importações e pendências são por lote: pending conta ocorrências cuja identidade integral não foi demonstrada, não publicações certamente ausentes. Não somar importações de execuções parcialmente sobrepostas como total único.
Se o início DJEN for interrompido antes de salvar run_id, marcar incompleto e alertar, em vez de repetir uma aceitação ambígua. Se só o transporte extensão/app falhar, reenvio usa o mesmo lote, sem iniciar novo DJEN.
API Domicílio não implementada: credenciamento e operações sem ciência precisam de confirmação oficial.

## Passos exatos no portal real (titular, etapa posterior)
1. Descompactar ZIP v0.3.0; carregar sem compactação em Chrome/Edge; atualizar extensão existente e recarregar abas. Esta implementação não instalou/ativou extensão.
2. Entrar no WnevesBox na conta correta; abrir Intimações; clicar Vincular uma vez. Recarregar e conferir restauração automática.
3. Fazer login com token exclusivamente no Jus.br. Não compartilhar token/PIN/cookies/senha/certificado ou chave privada.
4. Abrir Minhas comunicações processuais → Diário da Justiça e acompanhar pesquisa automática da OAB cadastrada. Se início/fim não forem identificados, fornecer somente seus labels/aria sanitizados para adaptar; não compartilhar campos secretos.
5. Acompanhar pelo menos três páginas reais; conferir contador 1–10/29 → 11–20/29 → 21–29/29, lotes e multiplicidade. Um clique sem avanço deve interromper em 20s, nunca repetir a página como nova.
6. Interromper durante envio/paginação; reabrir/recarregar e verificar retomada com mesmo lote. Testar outra conta sem transferência de fila. Alteração dos resultados na retomada deve interromper, não sobrescrever lote.
7. Testar vazio: deve interromper como NÃO confirmado até obter evidência explícita do estado vazio. Testar sessão indisponível sem automatizar login.
8. Conferir que nenhum controle de linha foi acionado e confirmar permissão de uso do portal.
9. Verificar histórico e conclusão DJEN de todos os lotes; só depois validar avanço incremental. API Domicílio continua pendente de credenciamento.
10. Comparar contagens e atos das páginas com os lotes/importações; testar ausência de ciência sem abrir conteúdo privado. Não clicar em olho/link/confirmar comunicação.

## Verificação desta entrega
36 testes passaram, incluindo pesquisa DOM, três páginas, retomada, falha de avanço, datas ambíguas e multiplicidade; sintaxe JS e ZIP verificados. Testes usam mocks/fixtures, não sessão Jus.br. Nada comprova funcionamento real autenticado ou cobertura integral. Backend novo é compartilhado pela aplicação publicada, mas site/ZIP v0.3.0 não foram publicados.
