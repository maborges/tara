# BALANCA-OPERATION-ORIGIN-01C — Validação Final E2E de Origem, Operação Local e Reconciliação

**Data da validação:** 2026-09-21  
**Escopo:** validação direcionada da entrega 01B. Nenhuma funcionalidade nova foi implementada e nenhuma correção foi necessária.

## 1. Evidências executadas

### Banco e migration 041

A migration `service/migrations/041_operation_origin_reconciliation.sql` está aplicada no PostgreSQL `farms`. A inspeção estrutural retornou:

- `tara.ordens.origem_operacao`: `NULL` permitido;
- `tara.ordens.reconciliation_status`: `NULL` permitido;
- `tara.ordens.referencia_externa`: `NULL` permitido;
- índice único parcial `uq_tara_ordens_tenant_system_reference` em `(tenant_id, sistema_cliente, referencia_externa)` quando a referência não é nula;
- índice `ix_tara_ordens_reconciliation`;
- tabela `tara.ordem_reconciliacoes_auditoria` com PK, FK para Ordem e FKs dos atores;
- índice da auditoria por tenant/Ordem/data;
- RLS e `FORCE ROW LEVEL SECURITY` na tabela de auditoria e na Ordem;
- trigger `trg_tara_ordem_reconciliacao_tenant` para consistência de tenant/atores.

A migration não contém `UPDATE`, backfill, transformação ou renomeação de dados históricos. A consulta de Ordens sem contexto de tenant não expôs linhas, conforme esperado pelo `FORCE RLS`; isso não foi tratado como evidência de ausência de histórico.

### Backend

Comando direcionado:

```text
./.venv/bin/pytest -q tests/test_operation_origin.py tests/test_avulsa_e2e.py tests/test_weighing_flow_foundation.py tests/test_weighing_result_engine.py tests/test_weighing_events.py tests/test_delivery_receipt_e2e.py tests/test_delivery_purge_e2e.py tests/test_service_e2e.py tests/test_block_01f.py tests/test_block_01k.py
```

Resultado: **16 passed**.

Regressões de isolamento e Delivery:

```text
./.venv/bin/pytest -q tests/test_consumer_isolation_e2e.py tests/test_delivery_contract.py tests/test_outbox_delivery.py
```

Resultado: **7 passed**.

Os testes cobrem a criação LOCAL, captura MULTIPLA PRE/POS, idempotência de `operation_local_id`/`local_id`, contexto de carga, reconciliação posterior na mesma Ordem, conflito, encerramento LOCAL, identidade qualificada e preservação de captura/marco/histórico. As suítes existentes cobrem tipos legados, OFFLINE-OP-01B, autorização/replay/challenge, RLS e Delivery.

### Station

| Verificação | Resultado |
| --- | --- |
| `pnpm run typecheck` | PASS |
| `pnpm run lint` | PASS |
| `pnpm run build` | PASS |
| Dexie v11 | evolução aditiva inspecionada; nenhum reset/recriação do IndexedDB |

O `sw.js` gerado pelo build e o cache de testes foram restaurados ao conteúdo anterior; não são alterações desta validação.

## 2. Matriz de cenários A–O

| Cenário | Resultado | Evidência/observação |
| --- | --- | --- |
| A — EXTERNA + ONLINE | PASS | Criação de Ordem externa e fluxo de captura cobertos pelas suítes de serviço; origem/identidade externa e `NAO_APLICAVEL` são persistidos. |
| B — EXTERNA disponível durante offline | PASS | Caminho de Ordem previamente sincronizada, autorização e reconexão coberto por `test_service_e2e.py`/OFFLINE-OP-01B; não foi alegada disponibilidade física de hardware. |
| C — LOCAL + ONLINE | PASS | `test_operation_origin.py` cria LOCAL sem referência, usa autorização da Station, sincroniza uma única Ordem e mantém `PENDENTE`. |
| D — LOCAL + OFFLINE | PASS | O mesmo caminho `OperacaoLocal`/fila/autorização é usado sem solicitação externa e reconcilia no retorno; nenhuma segunda Ordem é criada. A validação foi pelo mecanismo E2E do projeto, sem corte físico de rede/hardware. |
| E — LOCAL MULTIPLA | PASS | PRE/POS na mesma `operation_local_id`, dois `local_id`, marcos oficiais, líquido `27050.000` e resultado preservado; reconciliação permanece pendente antes de decisão externa. |
| F — solicitação externa posterior | PASS | A solicitação com `operation_local_id` retorna a mesma `ordem.id`; origem LOCAL, identidade externa, `CONCILIADA`, capturas, marcos, histórico e contexto permanecem na Ordem canônica. |
| G — retry/idempotência | PASS | Retry do mesmo `local_id`/`operation_local_id` retorna a Ordem existente; reconciliação usa lock transacional e não duplica fatos físicos. Repetições de decisão geram apenas novo registro auditável, sem alteração física. |
| H — conflito | PASS | Divergência de veículo/contexto retorna `409`, marca `CONFLITO`, não associa identidade externa e preserva Ordem/Pesagens. |
| I — isolamento de identidade | PASS | `system-a/REF-SAME` e `system-b/REF-SAME` no mesmo tenant são Ordens distintas; suíte de isolamento/RLS passou. O índice inclui tenant e sistema. |
| J — encerramento LOCAL | PASS | `ENCERRAR_LOCAL` explícito marca `NAO_APLICAVEL`, cria auditoria e não fabrica referência externa. |
| K — contexto da carga | PASS | JSONB/API/sync e snapshot da Pesagem suportam produto, volumes, peso declarado, lote e documentos; a Station não oferece editor completo de volumes/documentos múltiplos (ressalva UX). |
| L — precedência externa | PASS | Reconciliação só enriquece chaves ausentes; incompatibilidade relevante gera `CONFLITO`; snapshot físico não é sobrescrito. |
| M — auditoria | PASS | Auditoria registra tenant, Ordem, estados, sistema, referência, timestamp, motivo e tipo; atores possuem FK/validação tenant e a tabela tem RLS/FORCE RLS. |
| N — imutabilidade | PASS | Testes verificam peso/etapa, `captured_at`, `local_id`, Station, Installation, DeviceConfiguration, evidência, contexto, marcos e histórico após reconciliação. |
| O — regressões | PASS | 23 testes direcionados passaram, incluindo legados, N-capturas, OFFLINE-OP-01B, Device, RLS, Delivery, ACK/purge/tombstone e contratos de evento existentes. |

## 3. Capacidade de carga e edição na Station

| Campo | Contrato/API/JSONB | Editável na UI atual |
| --- | --- | --- |
| Produto — código e descrição | PASS | SIM |
| Quantidade de volumes | PASS | NÃO |
| Tipo de volume | PASS | NÃO |
| Peso unitário declarado | PASS | NÃO |
| Peso declarado | PASS | SIM |
| Lote | PASS | SIM |
| Documentos | PASS | SIM, um documento de carga no formato NF |
| Múltiplos volumes/documentos | PASS | NÃO há editor dedicado |

As limitações de volumes múltiplos e candidatos de reconciliação são ressalvas de UX/operacionais. Não são falhas do Core, do contrato JSONB, da persistência ou da idempotência e não invalidam a fundação técnica.

## 4. Defeitos e correções

Nenhum defeito BLOCKING ou HIGH foi encontrado. Não houve alteração de código, migration, banco, Device, Delivery ou contrato de evento durante esta validação.

## 5. Compatibilidade

- `UNICA`, `DUPLA`, `DUPLA_ENTRADA_DESCARGA` e `DUPLA_SAIDA_CARREGAMENTO` permanecem legíveis e testados;
- `OfflineCaptureAuthorization`, replay protection, challenge/proof, StationInstallation e DeviceConfiguration continuam obrigatórios;
- DeliveryReceipt, ACK, retenção, purge, tombstone e `balanca.pesagem.concluida.v1` não foram alterados;
- registros históricos não receberam valores artificiais nos novos campos;
- uma reconciliação nunca copia, move ou altera a Pesagem física.

## 6. Veredicto

As evidências direcionadas comprovam a origem EXTERNA/LOCAL, operação LOCAL online/offline pelo caminho existente, reconciliação na mesma Ordem, idempotência física, isolamento tenant, auditoria e preservação dos fatos de pesagem. As únicas pendências são a UX de candidatos e o editor completo de volumes/documentos.

BALANCA-OPERATION-ORIGIN-01C STATUS: CONCLUÍDO

GO COM RESSALVAS

As ressalvas são exclusivamente UX/operacionais e não invalidam a fundação técnica. Não iniciar outro épico automaticamente.
