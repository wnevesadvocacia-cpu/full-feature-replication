- [x] Preparar extensão local para conferência após login no Jus.br, sem ciência automática; pacote e download validados, 22 testes passaram, leitura do Diário e exclusão do Domicílio verificadas em página de teste. Não declarar cobertura autenticada.
- [ ] Validar compatibilidade e permissão de leitura no portal real — bloqueado: requer extensão instalada no navegador do titular, login autorizado com token e verificação das regras do portal; sessão e token não são acessados pelo WnevesBox.
- [x] Considerar o ícone indicado pelo usuário como entrada; instrução aponta “Minhas comunicações processuais” → “Diário da Justiça”, sem clicar em atos de ciência.
- [x] Avaliar login Jus.br dentro do sistema — botão externo existente; login incorporado não transfere sessão nem habilita integração autorizada.
- [x] Preservar login com token exclusivamente no Jus.br, sem captura do token pela extensão.
- [x] Exibir controle de carga no Dashboard.
- [x] Disponibilizar conferência manual na Central do Jus.br na página de intimações; endereço e aviso verificados em sessão autenticada. Integração automática privada permanece bloqueada por falta de acesso autorizado para o aplicativo.
- [x] Exibir aviso de login e oferecer reconciliação pública dos últimos 30 dias com resultado/erro visível e alerta; 16 testes passaram e compilação OK. Não há detecção do login externo nem rastreamento da sessão privada.
- [x] Exibir e validar controle de carga no modal Editar Prazo.
- [x] Identificar quem iniciou a elaboração independentemente do responsável e validar a exibição.
- [x] Corrigir timeout da sincronização manual e impedir confirmação falsa de ausência de publicações; validar execução autenticada.
- [x] Impedir cobertura completa falsa por falhas nos diários adicionais, paginação ou leitura de processos; 12 testes e busca autenticada concluída (262 consultas); atos fora das fontes públicas exigem conferência autenticada nos tribunais.
- [ ] Integrar acesso autorizado com login único a todos os tribunais brasileiros e cobrir atos sigilosos/intimações pessoais — bloqueado: nenhum conector CNJ disponível; documentação oficial do SSO PDPJ não apresenta habilitação pública de aplicativos comerciais, e Domicílio exige credenciais específicas emitidas ao titular autorizado. Jus.br é acesso oficial aos sistemas integrados, não prova cobertura universal nem autoriza importação pelo WnevesBox. Requer confirmar habilitação oficial da integração e escopo de acesso; não presumir ciência nem substituir acesso privado por DJEN/DataJud ou atalhos.
- [x] Reduzir CPU evitando classificar publicações já persistidas e distinguir falhas complementares no indicador; 16 testes passaram, busca autenticada concluiu com 266 consultas/306 publicações existentes/0 novas e saúde operante sem falhas; instabilidade externa pode reaparecer.

- [x] Implementar fila/vínculo persistentes, ingestão e reconciliação direcionada, controlador seguro e pacote Jus.br v0.2; 31 testes passaram, build OK, funções implantadas, RLS/grants verificados e rejeição 401 validada. Controlador testado em simulação; adaptador real continua restrito às telas visíveis.
- [ ] Habilitar pesquisa/paginação Jus.br real — bloqueado: faltam evidências dos controles autenticados; interromper explicitamente, sem inventar seletores.

- [ ] Implementar adaptador com controles relatados em 08/10: pesquisar, verificar avanço pelo contador, persistir retomada por conta/OAB, testar sem ações de linha; vazio e integração real continuam pendentes.
