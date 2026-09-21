# BALANCA-WEIGHING-FLOW-02C — Motor de Resultado N Capturas

## Escopo executado

Foi implementado somente o motor de domínio para operações `MULTIPLA`:

`CAPTURAS → MARCOS OFICIAIS → VALIDAÇÃO FÍSICA → RESULTADO`.

Station/UX/Dexie, Device, Delivery e o evento `balanca.pesagem.concluida.v1`
não foram alterados.

## Arquivos alterados

- `service/migrations/040_weighing_flow_result_engine.sql`: migration aditiva com projeção atual do resultado e histórico versionado.
- `service/app/models.py`: modelo `OrdemResultadoHistorico` e campos de resultado em `Ordem`.
- `service/app/schemas.py`: campos de resultado em `OrderOut` e contrato de consulta do histórico.
- `service/app/operation.py`: recomputação determinística por marcos oficiais, validação PRE/POS, deltas auxiliares e integração com captura/troca de marco.
- `service/app/routes/integrations.py`: consultas aditivas do histórico do resultado para cliente e Backoffice.
- `service/tests/test_weighing_result_engine.py`: testes das regras comerciais, pendências, troca de marco, histórico e imutabilidade.

As alterações anteriores da fundação 02B (`039_weighing_flow_foundation.sql`, marcos
oficiais e dimensões da captura) foram reutilizadas; não foram refeitas.

## Regra final

O motor lê exclusivamente o marco oficial de cada estágio. Não escolhe captura
por ordem temporal, maior/menor peso, `max()`, `min()` ou `abs()`.

Para `RECEBIMENTO`, exige `PRE_OPERACAO > POS_OPERACAO` e grava:

```text
bruto  = PRE_OPERACAO
tara   = POS_OPERACAO
líquido = PRE_OPERACAO - POS_OPERACAO
```

Para `EXPEDICAO`, exige `POS_OPERACAO > PRE_OPERACAO` e grava:

```text
tara   = PRE_OPERACAO
bruto  = POS_OPERACAO
líquido = POS_OPERACAO - PRE_OPERACAO
```

Inversão física lança erro e não persiste uma nova projeção válida. `CHEGADA`,
`SAIDA` e `INTERMEDIARIA` não alteram o líquido comercial. Quando os marcos
auxiliares existem, são calculados separadamente:

- `delta_pre_operacao_kg = PRE_OPERACAO - CHEGADA`;
- `delta_pos_operacao_kg = SAIDA - POS_OPERACAO`.

Sem `CHEGADA` ou `SAIDA`, o delta correspondente fica nulo.

`TRANSFERENCIA`, `DEVOLUCAO` e `OUTRA` ficam em `PENDENTE_SEM_REGRA`, com motivo
explícito, sem fallback absoluto. O suporte futuro exigirá uma regra física
inequívoca para cada natureza.

## Aptidão e estado da Ordem

- A criação de uma operação `MULTIPLA` já inicia em `EM_PESAGEM`.
- Sem marcos oficiais PRE/POS, o resultado fica `PENDENTE` e a Ordem permanece `EM_PESAGEM`.
- Com PRE/POS válidos para `RECEBIMENTO` ou `EXPEDICAO`, o resultado fica `VALIDO`, `tara_source = MEASURED`, e a Ordem passa a `CONCLUIDA`.
- CHEGADA, SAIDA e a quantidade de capturas não concluem a operação.
- Naturezas sem regra permanecem `EM_PESAGEM`.

As quatro modalidades legadas (`UNICA`, `DUPLA`,
`DUPLA_ENTRADA_DESCARGA` e `DUPLA_SAIDA_CARREGAMENTO`) continuam usando o
motor existente, sem reinterpretar histórico.

## Persistência e mudança de marco

`tara.ordens` recebeu, de forma aditiva:

- `resultado_status`;
- `resultado_motivo`;
- `resultado_versao`;
- `resultado_calculado_em`;
- `delta_pre_operacao_kg` e `delta_pos_operacao_kg`.

Cada recomputação cria uma linha imutável em
`tara.ordem_resultados_historico`, com a versão, os marcos PRE/POS usados, os
valores calculados, `tara_source`, deltas e timestamp. A versão é monotônica por
Ordem. A projeção atual em `ordens` é apenas o estado corrente reproduzível a
partir dos marcos oficiais.

Ao trocar explicitamente um marco, a Pesagem permanece intocada e o motor é
executado novamente. A nova versão registra a troca; não há sobrescrita
silenciosa nem exclusão da evidência anterior. O histórico pode ser consultado
por:

```text
GET /v1/orders/{order_id}/result-history
GET /v1/admin/orders/{order_id}/result-history
```

Antes de substituir um marco PRE/POS, a relação física é validada para que uma
inversão seja rejeitada sem alterar o marco atualmente válido.

## Migration e compatibilidade

`040_weighing_flow_result_engine.sql` é exclusivamente aditiva: cria colunas,
tabela, índice e RLS/política de tenant. Não transforma nem preenche registros
históricos e não remove constraints existentes. A tabela de histórico referencia
a Ordem e os marcos oficiais, com unicidade `(tenant_id, ordem_id, versao)`.

Pesagem continua imutável, com unicidade física `tenant_id + local_id`. O motor
não altera `operation_local_id`, reconciliação offline, OfflineCaptureAuthorization,
StationInstallation, DeviceConfiguration, challenge/proof, DeliveryReceipt,
ACK, purge, tombstone ou RLS existentes.

## Testes executados

Migration aplicada no banco de desenvolvimento `farms` com sucesso.

Suíte nova e fundação:

```text
PYTHONPATH=. .venv/bin/pytest -q \
  tests/test_weighing_result_engine.py \
  tests/test_weighing_flow_foundation.py
```

Resultado após o ajuste de estado inicial: **6 passed**.

Suítes direcionadas completas:

```text
PYTHONPATH=. .venv/bin/pytest -q \
  tests/test_weighing_result_engine.py \
  tests/test_weighing_flow_foundation.py \
  tests/test_weighing_events.py \
  tests/test_weighing_calculation.py \
  tests/test_avulsa_e2e.py \
  tests/test_service_e2e.py \
  tests/test_delivery_receipt_e2e.py \
  tests/test_delivery_purge_e2e.py
```

Resultado: **12 passed**.

Os testes cobrem RECEBIMENTO e EXPEDICAO válidos, as duas inversões físicas,
ausência de PRE/POS, CHEGADA/SAIDA/INTERMEDIARIA fora do líquido, capturas
repetidas no mesmo estágio, seleção exclusiva do marco oficial, recomputação
após troca explícita, histórico, imutabilidade e ausência de regressão nos
fluxos legados, Device/Station e Delivery direcionados.

## Riscos e pendências

- Não há ainda fluxo de escolha de marco na Station/UX; os endpoints e o Core já
  suportam a troca explícita.
- Não há regra comercial para TRANSFERENCIA, DEVOLUCAO ou OUTRA.
- Não há métricas de resultados parciais para INTERMEDIARIA.
- Não foi criado evento de resultado consolidado; o evento v1 permanece por
  captura/fluxo legado.
- A projeção é atualizada dentro da mesma transação da captura ou da troca de
  marco; consumidores externos do resultado consolidado continuam pendentes de
  contrato futuro.

## Veredicto

**BALANCA-WEIGHING-FLOW-02C STATUS: CONCLUÍDO**

**GO COM RESSALVAS** para iniciar o 02D. O motor de resultado N capturas está
implementado e compatível, mas Station/UX, naturezas sem regra e o contrato de
evento consolidado permanecem pendentes para fases posteriores.
