# BALANCA-WEIGHING-FLOW-02D — Station, Offline e Sync N Capturas

## Escopo executado

Foi implementada a integração da Station com o modelo `MULTIPLA` entregue em 02B/02C, preservando operações legadas, operação offline, idempotência física e reconciliação `operation_local_id → ordem_id`.

Não foram alterados Device, Delivery ou o evento consolidado. Não foi criada migration nem houve limpeza/recriação do IndexedDB.

## Arquivos alterados

- `station/src/lib/db.ts`: tipos aditivos de natureza, modalidade, direção, estágio, finalidade e método; resultado local; ações dinâmicas para `MULTIPLA`.
- `station/src/app/(balanca)/pesagem/page.tsx`: UX de operação MULTIPLA, PRE/POS, CHEGADA/SAIDA opcionais, INTERMEDIARIA repetível, conferência, diferença de peso, resultado e status de sincronização.
- `station/src/lib/sync/push.ts`: envelope aditivo com natureza/modalidade, dimensões da captura e contexto da operação.
- `station/src/lib/sync/pull.ts`: persistência aditiva do resultado retornado pela Cloud e atualização das operações locais mapeadas.
- `station/src/lib/contingency.ts`: preservação de natureza, modalidade, direção, finalidade e método na contingência.
- `station/src/app/api/v1/[...path]/route.ts`: proxy para o endpoint Station de troca explícita de marco.
- `service/app/operation.py`: primeira captura operacional PRE/POS torna-se marco oficial somente se ainda não houver marco; inversões são validadas antes de persistir a captura.
- `service/app/routes/integrations.py`: endpoint Station para troca explícita de marco e retorno de resultado no sync pull.
- `service/app/schemas.py` e `service/app/contingency_service.py`: campos aditivos na contingência.
- `service/tests/test_avulsa_e2e.py`: E2E de operação MULTIPLA offline, retry, conferência, troca de marco e sync pull.

## Comportamento implementado

Para novas operações, a Station permite selecionar `MULTIPLA` e a natureza (`RECEBIMENTO`, `EXPEDICAO`, `TRANSFERENCIA`, `DEVOLUCAO` ou `OUTRA`). O operador não precisa selecionar marco oficial no fluxo normal.

As ações são calculadas pelas capturas individuais, não por uma sequência fixa:

- início: `PRE_OPERACAO` (`CHEGADA` opcional);
- após PRE: `POS_OPERACAO`, qualquer quantidade de `INTERMEDIARIA` ou repetição de PRE;
- após POS: `SAIDA` opcional ou repetição de POS.

Não há exigência de CHEGADA antes de PRE nem de SAIDA depois de POS. Cada captura recebe UUID `local_id` próprio e permanece listada cronologicamente. Os quatro tipos legados continuam usando a sequência original.

Captura `OPERACIONAL` de PRE/POS cria o marco oficial apenas quando ainda não existe um marco para o estágio. Nova captura do estágio é tratada como `CONFERENCIA` por padrão e não substitui a oficial. A tela mostra peso oficial inicial, nova captura, diferença absoluta/percentual e ação **Usar como oficial**. Essa ação chama:

```text
POST /v1/stations/orders/{order_id}/official-marks
```

A Pesagem anterior permanece imutável; o Core recompõe o resultado e mantém o histórico versionado de 02C. `AMOSTRAGEM` é transportada sem workflow laboratorial.

## Dexie, offline e sync

O schema Dexie foi evoluído aditivamente para a versão 10, apenas com campos opcionais e índices já existentes. Não há `clear`, reset ou recriação de banco. Uma operação offline MULTIPLA é criada antes da primeira captura; todas as capturas reutilizam o mesmo `operation_local_id`, cada uma com `local_id`, autorização, evidência, contexto e estado de sincronização próprios.

O envelope envia natureza, modalidade, direção, estágio, finalidade, método, identidades e contexto operacional. O primeiro push resolve ou cria uma única Ordem; retries reutilizam as chaves existentes. Capturas posteriores podem ser enviadas ainda com `ordem_id` local nulo porque o payload da operação permite a mesma reconciliação determinística.

O pull atualiza a Ordem local e a OperacaoLocal com bruto, tara, líquido, `resultado_status`, motivo e deltas. A contingência preserva os mesmos campos sem alterar assinatura, sequência, StationInstallation, DeviceConfiguration, autorização offline ou replay protection.

## Resultado na Station

Quando o Core retorna resultado, a Station mostra bruto, tara, líquido, status e os deltas pré/pós separadamente. Os deltas nunca são somados ao líquido. Sem PRE/POS oficiais aparece resultado pendente. Para naturezas sem regra, o motivo de pendência é mostrado sem inventar conclusão.

## Testes executados

Station:

```text
pnpm run typecheck   # PASS
pnpm run lint        # PASS
pnpm run build       # PASS
```

Backend direcionado:

```text
PYTHONPATH=. .venv/bin/pytest -q \
  tests/test_weighing_result_engine.py \
  tests/test_weighing_flow_foundation.py \
  tests/test_avulsa_e2e.py \
  tests/test_weighing_events.py \
  tests/test_weighing_calculation.py \
  tests/test_service_e2e.py \
  tests/test_delivery_receipt_e2e.py \
  tests/test_delivery_purge_e2e.py
```

Resultado final: **12 passed**.

O E2E cobre PRE, INTERMEDIARIA, POS, repetição de PRE como conferência, mesmo `operation_local_id`, `local_id` distinto por captura, retry sem duplicação, troca explícita do marco, resultado recalculado e retorno no sync pull.

## Compatibilidade e regressões

- `UNICA`, `DUPLA`, `DUPLA_ENTRADA_DESCARGA` e `DUPLA_SAIDA_CARREGAMENTO` mantêm o comportamento anterior.
- OFFLINE-OP-01B, operação avulsa, contingência e autorizações offline permanecem compatíveis.
- Pesagem continua imutável; `tenant_id + local_id` e `operation_local_id → Ordem` permanecem idempotentes.
- Device, DeliveryReceipt/ACK/purge/tombstone e challenge/proof não foram alterados.
- Nenhum evento consolidado foi criado e `balanca.pesagem.concluida.v1` não foi reinterpretado.

## Pendências

1. Não há tela dedicada de resolução humana para conflitos de reconciliação; o estado é preservado como pendente.
2. Não existe regra comercial para `TRANSFERENCIA`, `DEVOLUCAO` ou `OUTRA`.
3. A lista local não recebe o conjunto completo de marcos oficiais do servidor; troca explícita exige captura sincronizada e usa o endpoint seguro do Core.
4. Não foi criado contrato/evento de resultado consolidado.

## Veredicto

**BALANCA-WEIGHING-FLOW-02D STATUS: CONCLUÍDO**

**GO COM RESSALVAS** para fechamento técnico do novo fluxo. A execução online, offline e a sincronização N-capturas estão integradas, com as pendências explicitamente mantidas fora deste escopo.
