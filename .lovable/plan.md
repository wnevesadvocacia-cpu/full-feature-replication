# Automação local Jus.br
## Tarefa / Escopo
- Persistir vínculo e lotes por usuário, processar com confirmações do servidor e retentativas por alarmes, sem bloqueio entre páginas.
- Acrescentar controlador de pesquisa/paginação retomável e incremental; adaptador real limitado aos controles comprovados. Pesquisa/paginação ficam explicitamente bloqueadas se não houver evidência dos controles.
- Persistir conferências no backend, reconciliar CNJs direcionados com DJEN sem alterar importações existentes e alertar resultados incompletos.
- Atualizar versão, pacote, painel e instruções; testar controlador, fila, validação, vazio, deduplicação e isolamento.
## Fora
Login automatizado, credenciais do Jus.br, Domicílio, ciência, publicação do site, instalação/ativação da extensão e alegação de validação autenticada.
