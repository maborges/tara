# Pesagens avulsas offline e integração do cliente

## Problem Statement

A operação da balança não pode parar quando não há conexão ou quando uma ordem não foi sincronizada. Hoje a estação já prevê uma captura avulsa, mas o backend exige `ordem_id`, impedindo a persistência, sincronização e integração completas desse caso. Além disso, o cliente precisa consumir as pesagens por API e webhook com segurança e idempotência.

## Solution

Permitir pesagens vinculadas e avulsas como fatos de primeira classe. A estação captura ambas offline com um `capture_id` imutável; o backend sincroniza sem exigir ordem prévia, preserva o contexto físico, fiscal e logístico e oferece reconciliação posterior. Após confirmação, o serviço publica `balanca.pesagem.concluida.v1` via outbox por Conta e disponibiliza API de consulta com cursor.

## User Stories

1. Como operador, quero registrar uma pesagem sem ordem sincronizada, para não interromper a entrada ou saída de veículos durante uma falha de conexão.
2. Como operador, quero registrar direção física `ENTRADA` ou `SAIDA`, para descrever o movimento do veículo na balança.
3. Como operador, quero informar o tipo ou motivo da operação, para explicar o contexto da pesagem.
4. Como operador, quero registrar veículo, motorista, transportadora, produto, origem e destino, para preservar o contexto logístico.
5. Como operador, quero informar nota fiscal e chave de acesso quando aplicáveis, para preservar o contexto fiscal.
6. Como operador, quero que a natureza da mercadoria seja derivada do CFOP quando houver CFOP, para evitar redigitação e divergências.
7. Como operador, quero registrar uma pesagem sem CFOP, para suportar conferência, movimentação interna e pesagem avulsa não fiscal.
8. Como operador, quero continuar capturando quando a estação estiver offline, para manter a operação local.
9. Como operador, quero que cada captura tenha um identificador local estável, para que reenvios não dupliquem a pesagem.
10. Como operador, quero concluir uma pesagem de duas etapas quando necessário, para registrar bruto e tara mesmo sem ordem prévia.
11. Como cliente, quero consultar pesagens vinculadas e avulsas pela API, para integrar os dados ao meu sistema.
12. Como cliente, quero filtrar pesagens por período, operação, veículo, estação e status, para reconciliar minha operação.
13. Como cliente, quero receber eventos por webhook, para processar pesagens com baixa latência.
14. Como cliente, quero retomar consultas por cursor, para sincronizar sem perder registros após uma falha.
15. Como cliente, quero identificar uma pesagem por `capture_id` e `event_id`, para processar reenvios de forma idempotente.
16. Como cliente, quero reconciliar uma pesagem avulsa com uma ordem existente, para associar o fato físico ao meu processo de negócio.
17. Como cliente, quero criar uma ordem a partir de uma pesagem avulsa, para completar o fluxo quando a ordem não existia.
18. Como cliente, quero encaminhar uma pesagem para revisão, para resolver dados incompletos sem alterar a captura original.
19. Como cliente, quero configurar o destino e os eventos do webhook no Portal, para controlar minha integração.
20. Como cliente, quero consultar tentativas, falhas e replays, para diagnosticar a entrega.
21. Como administrador da plataforma, quero visualizar a operação das Contas, para prestar suporte.
22. Como administrador da plataforma, quero intervir em uma integração com auditoria, para recuperar falhas sem assumir a operação normal do cliente.
23. Como sistema consumidor, quero receber `2xx` como confirmação, `409` idempotente como duplicidade processada e retry para `5xx`/timeout, para implementar um receptor previsível.

## Implementation Decisions

- O endpoint de sincronização da estação é a seam principal para pesagens vinculadas e avulsas.
- `ordem_id` é opcional para uma pesagem; `capture_id` é obrigatório e único por Conta.
- `weighings:read` consulta pesagens; `weighings:reconcile` permite alterar somente o vínculo/estado de reconciliação.
- Uma pesagem avulsa tem estado de reconciliação e não cria ordem artificial automaticamente.
- Pesagens são imutáveis depois de confirmadas; reconciliação altera somente vínculo e estado de negócio.
- O registro preserva direção física do veículo, natureza da mercadoria, tipo/motivo e contexto fiscal/logístico.
- A natureza é `ENTRADA`, `SAIDA` ou `NEUTRA`; CFOP iniciado por 1/2/3 deriva `ENTRADA`, e 5/6/7 deriva `SAIDA`.
- O evento de conclusão usa campos públicos em `snake_case`, `account_id`, `entity_id` da pesagem, `occurred_at` e `received_at`.
- O outbox entrega por Conta com HMAC, `event_id`, timestamp, assinatura do método/caminho/corpo e política at-least-once.
- A API de leitura expõe ordens, pesagens e eventos com escopos separados e paginação por cursor.
- O Portal é o lugar normal para administrar estações, operadores, configurações e integrações; o Backoffice faz governança e suporte excepcional.

## Testing Decisions

- Testes atravessam o endpoint de sincronização e verificam comportamento externo, não detalhes internos.
- Cobrir captura avulsa online e offline, captura vinculada, uma e duas etapas, ausência de CFOP, derivação por CFOP, dados fiscais/logísticos e conflito de `capture_id`.
- Cobrir reconciliação para ordem existente, criação de ordem e revisão manual.
- Cobrir publicação de evento, payload versionado, HMAC, `2xx`, `409`, `4xx`, `5xx`, timeout e retry.
- Cobrir isolamento por Conta e escopos de API.
- Usar como precedente os testes E2E do serviço e os testes de importação de contingência existentes.

## Out of Scope

- Implementar cobrança, faturamento ou catálogo comercial completo.
- Alterar o domínio do AgroSaaS ou seus subscribers internos.
- Permitir que o Backoffice substitua o Portal como operação normal do cliente.
- Prometer entrega exatamente-uma-vez.
- Criar suporte a um terceiro tipo de direção física além de `ENTRADA` e `SAIDA`.

## Further Notes

O código atual tem uma implementação parcial: a estação já modela `ordem_id` nulo, mas o backend e a tabela ainda exigem ordem; o destino de outbox por Conta está inicialmente configurado por ambiente e deve evoluir para configuração persistida e administrável pelo Portal.
