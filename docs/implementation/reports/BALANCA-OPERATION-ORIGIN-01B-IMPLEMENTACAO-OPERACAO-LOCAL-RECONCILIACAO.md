# BALANCA-OPERATION-ORIGIN-01B — Implementação de Origem Local, Carga e Reconciliação

**Escopo:** implementação aditiva dos gaps da auditoria 01A. Não houve redesenho de Pesagem, Device, Delivery ou WEIGHING-FLOW-02.

## 1. Arquivos alterados

### Backend

- `service/migrations/041_operation_origin_reconciliation.sql`
- `service/app/models.py`
- `service/app/schemas.py`
- `service/app/operation.py`
- `service/app/routes/integrations.py`
- `service/app/contingency_service.py`
- `service/tests/test_operation_origin.py`

### Station

- `station/src/lib/db.ts`
- `station/src/lib/sync/push.ts`
- `station/src/lib/sync/pull.ts`
- `station/src/lib/contingency.ts`
- `station/src/app/(balanca)/pesagem/page.tsx`

## 2. Migration 041

`041_operation_origin_reconciliation.sql` foi aplicada no banco de desenvolvimento `farms`.

Alterações aditivas:

- `tara.ordens.origem_operacao VARCHAR(10)`, nullable;
- `tara.ordens.reconciliation_status VARCHAR(20)`, nullable;
- `tara.ordens.referencia_externa` passou a aceitar `NULL` para operações LOCAL;
- índice único parcial para identidade externa: `(tenant_id, sistema_cliente, referencia_externa)` quando a referência não é nula;
- índice por tenant/estado de reconciliação;
- tabela `tara.ordem_reconciliacoes_auditoria`;
- trigger de consistência tenant da Ordem e dos atores;
- RLS e `FORCE ROW LEVEL SECURITY` na tabela de auditoria.

Nenhum registro histórico foi preenchido, transformado ou renomeado. A confirmação no banco mostrou as três colunas relevantes nullable, o índice forte instalado e RLS/ FORCE RLS ativo.

## 3. Modelo final

### Ordem

Campos novos:

- `origem_operacao`: `EXTERNA` ou `LOCAL`, nullable para legado;
- `reconciliation_status`: `NAO_APLICAVEL`, `PENDENTE`, `CONCILIADA` ou `CONFLITO`, separado de `Ordem.status`;
- `operation_local_id` continua sendo a identidade técnica única da operação local;
- `referencia_externa` é obrigatória semanticamente para `EXTERNA` e opcional para `LOCAL`.

Para compatibilidade, chamadas externas antigas sem `origem_operacao` continuam sendo tratadas como `EXTERNA` na criação de uma nova Ordem. Ordens antigas permanecem com origem nula.

### Estados

- `EXTERNA`: normalmente `NAO_APLICAVEL`;
- `LOCAL` recém-criada: `PENDENTE`;
- LOCAL vinculada explicitamente ao processo externo: `CONCILIADA`;
- divergência concreta ou identidade já ocupada: `CONFLITO`;
- encerramento explícito de uma LOCAL sem processo externo: `NAO_APLICAVEL`.

`OperacaoLocal.reconciliation_status` e `MAPEADA` foram preservados como estados técnicos de sync. O Dexie recebeu `estado_reconciliacao` para o estado de negócio, evitando misturar mapeamento Cloud com conciliação.

## 4. Identidade e reconciliação

### LOCAL

`OfflineOperationIn` e a Station transportam `origem_operacao = LOCAL`, `operation_local_id` obrigatório e `referencia_externa = null` quando não informada. A Ordem local usa apenas identificadores técnicos internos (`tara-local`/tenant técnico), sem apresentar isso como referência de sistema cliente.

O caminho LOCAL continua sendo o mesmo para online e offline: a Station cria `OperacaoLocal`, captura com `local_id`, usa `OfflineCaptureAuthorization` e envia pelo sync. Conectividade não cria novos estados de origem e não existe bypass de autorização, replay, challenge/proof, Installation ou DeviceConfiguration.

### EXTERNA

`sistema_cliente`, `tenant_cliente_id` e `referencia_externa` são exigidos. A unicidade forte Cloud é garantida por tenant, sistema e referência; a referência nunca é comparada isoladamente em novas operações explícitas.

### Solicitação externa posterior

Uma solicitação externa pode informar `operation_local_id` em `OrderIn`. O Core bloqueia a Ordem LOCAL, valida:

- identidade externa não ocupada por outra Ordem;
- tipo, modalidade, natureza e sujeito compatíveis;
- divergências relevantes em processo, veículo, motorista ou carga.

Quando válida, a mesma Ordem é enriquecida com a identidade externa e passa a `CONCILIADA`. O `id`, `operation_local_id`, Pesagens, `local_id`, marcos, histórico de resultado, evidências e Delivery permanecem na mesma Ordem. Nenhuma Pesagem é copiada, recriada ou movida.

Quando há incompatibilidade ou a identidade externa já pertence a outra Ordem, a operação fica `CONFLITO`, a API retorna conflito e nenhuma associação externa é realizada.

Endpoints aditivos:

```text
POST /v1/orders/{order_id}/reconciliation
POST /v1/admin/orders/{order_id}/reconciliation
GET  /v1/orders/{order_id}/reconciliation-audit
GET  /v1/admin/orders/{order_id}/reconciliation-audit
```

`CONCILIAR`, `ENCERRAR_LOCAL` e `MARCAR_CONFLITO` exigem comando explícito e ator autenticado. A decisão humana é suportada pelo endpoint seguro; não foi criado workflow paralelo de usuários.

## 5. Auditoria

`OrdemReconciliacaoAuditoria` registra:

- tenant e Ordem;
- estado anterior e novo;
- sistema e referência externa;
- timestamp da decisão;
- `ator_user_id` quando a decisão vem do backoffice;
- `ator_client_id` quando vem de integração;
- motivo e tipo da decisão.

Há FK para Ordem/atores, trigger de consistência de tenant, índice por Ordem/data e RLS com `FORCE`.

## 6. Contexto de carga e precedência

O contexto permanece em JSONB, sem cadastros mestres. A Station passou a aceitar e transportar, como contexto opcional:

- produto: `codigo_externo`, `descricao`;
- peso declarado;
- lote;
- documento de carga;
- carretas e transporte já existentes.

O envelope preserva a estrutura `carga` e a contingência também transporta a origem. A Station não exige NF para pesar.

Para EXTERNA, o contexto do processo gerador permanece a referência negocial. Para LOCAL, o contexto informado na Station é o snapshot operacional inicial. Na reconciliação, o Core somente enriquece chaves ausentes; divergências relevantes ficam em `CONFLITO` e nunca são sobrescritas silenciosamente. O contexto já gravado em cada Pesagem continua imutável.

## 7. Station, Dexie e sync

- Dexie evoluiu para a versão 11 sem limpar ou recriar IndexedDB.
- `OperacaoLocal` ganhou origem e estado de reconciliação de negócio como campos aditivos.
- `OrdemPendenteLocal` recebe origem, estado de reconciliação e `operation_local_id`.
- Filas, `operation_local_id`, `local_id`, resultados, contexto e capturas pendentes continuam preservados.
- Push envia origem e referência externa opcional.
- Pull atualiza origem, estado de reconciliação, resultado e deltas nas operações mapeadas.
- Conflitos de sync passam a refletir `CONFLITO` localmente, sem consumir uma autorização inválida nem criar segunda Ordem.
- A UI de nova operação LOCAL permite referência, carga e documentos opcionais; processo, cavalo, motorista e documento do motorista continuam sendo o mínimo operacional.

LOCAL + ONLINE continua usando autorizações pré-carregadas. Isso é deliberado: conectividade não concede bypass de `OfflineCaptureAuthorization`.

## 8. Proteção da Pesagem

A reconciliação opera na Ordem/contexto. Os testes confirmam preservação de:

- peso e etapa;
- `captured_at` e `local_id`;
- Station, StationInstallation e DeviceConfiguration;
- leitura/evidência e snapshot JSONB;
- marcos oficiais e histórico de resultado.

`ordem_id` continua podendo ser alterado somente pelos caminhos de reconciliação já autorizados. Nenhum trigger de imutabilidade foi endurecido de forma incompatível com esse caminho.

## 9. Testes executados

### Backend

```text
.venv/bin/pytest -q \
  tests/test_operation_origin.py \
  tests/test_avulsa_e2e.py \
  tests/test_weighing_flow_foundation.py \
  tests/test_weighing_result_engine.py \
  tests/test_weighing_events.py \
  tests/test_delivery_receipt_e2e.py \
  tests/test_delivery_purge_e2e.py
```

Resultado: **11 passed**.

`test_operation_origin.py` cobre LOCAL sem referência, MULTIPLA PRE/POS, retry de `operation_local_id`/`local_id`, contexto de carga, reconciliação posterior na mesma Ordem, auditoria, preservação de capturas/marcos/histórico, conflito, isolamento de identidade física e encerramento explícito.

As suítes existentes cobrem EXTERNA, operações disponíveis offline, OFFLINE-OP-01B, tipos legados, resultado N-capturas, Device/autorizações/replay e Delivery/ACK/purge.

Validação adicional de regressão: `tests/test_service_e2e.py`, `tests/test_block_01f.py` e `tests/test_block_01k.py` — **5 passed**.

### Station

| Comando | Resultado |
| --- | --- |
| `pnpm run typecheck` | PASS |
| `pnpm run lint` | PASS |
| `pnpm run build` | PASS |

## 10. Compatibilidade e pendências

- `UNICA`, `DUPLA`, `DUPLA_ENTRADA_DESCARGA` e `DUPLA_SAIDA_CARREGAMENTO` permanecem compatíveis.
- OFFLINE-OP-01B, WEIGHING-FLOW-02, `local_id`, `operation_local_id`, RLS, Device e Delivery não foram redesenhados.
- `balanca.pesagem.concluida.v1` não foi reinterpretado.
- Registros históricos continuam legíveis com origem/estado nulos.
- Não foi criado cadastro mestre de produto, volume, NF, lote, cliente ou fornecedor.
- A Station não possui ainda uma tela dedicada para listar candidatos auxiliares e conduzir uma reconciliação humana rica; os endpoints seguros já permitem decisão explícita.
- O contexto de volumes múltiplos é transportado por JSONB/API; a UI atual oferece campos básicos de carga, não um editor completo de volumes.
- A autorização pré-carregada continua obrigatória mesmo online e deve permanecer documentada no runbook operacional.

## 11. Veredicto

Os gaps críticos da 01A foram implementados de forma aditiva: origem explícita, referência externa opcional para LOCAL, identidade externa qualificada, reconciliação posterior na mesma Ordem, estados separados, auditoria, contexto de carga e evolução Dexie/sync.

**BALANCA-OPERATION-ORIGIN-01B STATUS: CONCLUÍDO**

**GO COM RESSALVAS** para iniciar a 01C. As ressalvas são operacionais/UX (candidatos e editor completo de volumes), não bloqueiam a fundação técnica nem alteram Device, Delivery ou Pesagem.
