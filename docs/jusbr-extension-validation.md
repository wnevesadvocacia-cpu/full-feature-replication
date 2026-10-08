# Jus.br v0.2.0 — validação e limites

## Entregue
- Vínculo persistente por usuário, restaurado com identidade atual do aplicativo; lotes de outra conta nunca são enviados pela nova conta.
- Fila local antes do envio, ID imutável, retentativas com espera progressiva (1–60 minutos), confirmações persistidas no servidor. Nenhum bloqueio entre páginas.
- Alarme local horário de conferência, recuperação ao iniciar o navegador; alarmes de retentativa desarmados quando a fila esvazia. Não há novo cron no servidor.
- Ingestão autenticada; isolamento por usuário; histórico, alerta idempotente, reconciliação DJEN com CNJs do lote mesmo fora do cadastro. Resultado aceito/running não é resultado concluído.
- Metadados duplicados preservados como ocorrências. Apenas o replay do mesmo ID de lote é deduplicado; IDs oficiais DJEN seguem responsáveis pela deduplicação de publicações.
- Controlador puro de busca/paginação incremental em core.js: checkpoint antes do envio, retomada com mesmo lote, sobreposição de sete dias, histórico inicial de 90 dias, falha em página repetida/vazio não explícito/fim desconhecido.

## NÃO habilitado / evidência necessária
O único adaptador disponível em portal.js continua sendo leitura de tabela com aba selecionada e cabeçalhos conhecidos. Não há evidência autenticada para formulário OAB/UF/datas, botão de pesquisar, controles de paginação, contador, mensagem de vazio, sessão expirada nem navegação até a Central. Nenhum seletor foi inventado. O controlador automatizado não é executado pelo adaptador real. Alarme horário reconfere a tela disponível; NÃO pesquisa todo o Diário.
O número salvo é sequência de telas observadas, não número real da página. Uma tela vazia gera erro explícito e não avança cobertura. O marcador lastCompleteEnd não avança enquanto não houver busca/paginação comprovadamente completa. Portanto janela incremental está preparada, não ativa no portal.
Não é possível afirmar sessão expirada apenas por ausência de tabela: o aviso distingue sessão/estrutura indisponível sem certificá-la.
Importações e pendências são por lote: pending conta ocorrências cuja identidade integral não foi demonstrada, não publicações certamente ausentes. Não somar importações de execuções parcialmente sobrepostas como total único.
Se o início DJEN for interrompido antes de salvar run_id, marcar incompleto e alertar, em vez de repetir uma aceitação ambígua. Se só o transporte extensão/app falhar, reenvio usa o mesmo lote, sem iniciar novo DJEN.
API Domicílio não implementada: credenciamento e operações sem ciência precisam de confirmação oficial.

## Passos exatos no portal real (titular, etapa posterior)
1. Descompactar ZIP v0.2.0; carregar sem compactação em Chrome/Edge; atualizar extensão existente e recarregar abas. Esta implementação não instalou/ativou extensão.
2. Entrar no WnevesBox na conta correta; abrir Intimações; clicar Vincular uma vez. Recarregar e conferir restauração automática.
3. Fazer login com token exclusivamente no Jus.br. Não compartilhar token/PIN/cookies/senha/certificado ou chave privada.
4. Abrir Minhas comunicações processuais → Diário da Justiça; pesquisar OAB/UF/período manualmente; verificar lote local, histórico persistido e alerta de conclusão DJEN.
5. Percorrer pelo menos três páginas manualmente, incluindo duas com metadados idênticos; confirmar fila sem bloqueio de 30 minutos e preservação das ocorrências.
6. Fechar Intimações, visitar outra página do Diário, reabrir Intimações na mesma conta; conferir retomada e mesmo ID. Reiniciar navegador e testar lote pendente. Testar conta diferente sem transferir filas.
7. Testar resultado vazio e login expirado: versão atual deve parar/alertar, nunca afirmar zero confirmado.
8. Para habilitar automação: fornecer evidência sanitizada da estrutura SOMENTE do Diário (labels/roles/HTML dos controles OAB, UF, datas, pesquisar, próxima página, contador, vazio, login), sem campos secretos, dados privados ou links de comunicação. Confirmar permissão de uso do portal.
9. Implementar adaptador verificado utilizando esses controles; conectar a core.collect. Validar search(checkpoint) restaurando filtros/página, read retornando signature/empty/end explícitos, next limitado ao Diário. Persistir checkpoint na extensão e atualizar lastCompleteEnd apenas após todas as páginas e lotes confirmados. Testar mudança de sessão durante execução sem seguir redirecionamentos de login.
10. Comparar contagens e atos das páginas com os lotes/importações; testar ausência de ciência sem abrir conteúdo privado. Não clicar em olho/link/confirmar comunicação.

## Verificação desta entrega
Testes automatizados usam mocks/fixtures, não sessão Jus.br. Nada comprova funcionamento real autenticado ou cobertura integral. Backend novo é compartilhado pela aplicação publicada, mas site/ZIP v0.2.0 não foram publicados.
