# Revisão tripla da tarefa sugerida

## Resultado
Submeter cada sugestão automática a três verificações distintas antes de apresentá-la como opção de tarefa. Repetir a mesma análise três vezes não equivale a três revisões independentes.

1. **Comando do ato:** verificar se a tarefa corresponde à providência efetivamente determinada, com evidência do texto — não à classe processual ou ao recurso citado no cabeçalho.
2. **Destinatário e prazo:** verificar destinatário expresso, quantidade/unidade do prazo e consistência com a sugestão. Ausência de informação suficiente impede aprovação automática.
3. **Revisão de conflito:** procurar determinações alternativas, atos históricos, negações, múltiplos comandos e incompatibilidades jurídicas identificáveis. Qualquer divergência retém a sugestão para conferência humana.

## Escopo
- Reutilizar o motor de cálculo e o identificador de destinatário existentes.
- Aplicar as três verificações à sugestão em Intimações e às opções de criação de tarefa; exibir resultado compacto com os motivos de retenção.
- Sugestão retida não será preenchida ou disponibilizada como opção automática. Criação manual continuará possível, sem esconder o ato original ou um vencimento já registrado.
- Preservar vencimentos existentes, tarefas, responsáveis, permissões e sincronização. Não alterar registros antigos em massa.
- Testar cada revisão e os conflitos, incluindo o caso de vista para contraminuta indevidamente classificado como apelação.
- Não publicar nem acessar o Jus.br.

## Detalhes técnicos
- Implementar um revisor determinístico compartilhado entre navegador e funções, com três resultados separados e justificativas verificáveis. Não haverá três chamadas de IA nem um selo de certeza artificial.
- Persistir o resultado das revisões na classificação já existente quando compatível, sem presumir que dados anteriores já foram revisados. Atualizar as funções que produzem a classificação e validar a paridade das regras.

## Limite necessário
Três revisões reduzem risco, mas não garantem erro zero nem substituem a conferência jurídica do inteiro teor. Ambiguidade, modalidade recursal não identificada ou destinatário genérico permanecem pendentes, mesmo que as três análises concordem.