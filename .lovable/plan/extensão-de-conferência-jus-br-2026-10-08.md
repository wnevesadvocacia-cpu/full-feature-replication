# Extensão de conferência Jus.br

## Tarefa
Disponibilizar uma extensão para Chrome/Edge, instalada uma vez, que confira publicações acessíveis após o login do usuário no Jus.br e alerte sobre possíveis faltantes no WnevesBox.

## Escopo
- Usar “Minhas comunicações processuais”, indicado na imagem, como entrada para a Central de Comunicações.
- Ler somente informações de publicações exibidas na aba Diário da Justiça, sem capturar senha, cookies ou tokens do Jus.br.
- Vincular a extensão ao usuário autenticado no WnevesBox, com validação de identidade no envio.
- Reutilizar a busca/importação DJEN para recuperar o texto oficial de publicações faltantes; uma linha resumida do portal não será tratada como intimação completa nem usada para calcular prazo.
- Mostrar alertas de recuperação e de conferência incompleta; páginas não lidas, resultados sem texto e erros nunca significam ausência de intimações.
- Disponibilizar download e instruções de instalação na página de intimações.

## Fora
- Clicar em ciência, abrir comunicações privadas, confirmar recebimento ou praticar atos processuais.
- Acesso universal aos tribunais, leitura automática do Domicílio Eletrônico ou garantia de cobertura integral.
- Contornar bloqueios do portal ou transferir sua sessão para o servidor.

## Detalhes técnicos e validação
- Manifest V3, permissões limitadas aos endereços necessários, leitura local e envios autenticados limitados e deduplicados.
- Testes focados de identificação, isolamento por usuário, duplicação e cobertura incompleta.
- Validar a extensão com uma página de teste reproduzindo a estrutura da imagem. O funcionamento real após login depende de validar a estrutura autenticada e a permissão de uso do portal; se isso não puder ser verificado, apresentar como pendente, não operante.
- A navegação e a busca automática só serão habilitadas quando seus controles puderem ser identificados com segurança; sem essa validação, limitar a leitura aos resultados já exibidos e sinalizar o limite.
