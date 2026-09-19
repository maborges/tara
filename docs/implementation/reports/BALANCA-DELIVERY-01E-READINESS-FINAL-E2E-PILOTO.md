# BALANCA-DELIVERY-01E — Readiness Final E2E para Piloto

## 1. Resumo executivo
A auditoria E2E validou o ciclo de vida de **Delivery** e **Retenção** com pleno sucesso (os mecanismos de Pull, ACK, Purge, Tombstone e RLS estão blindados). Porém, o ciclo inicial de **Captura e Sync** apresentou falhas críticas durante a regressão global, resultando na quebra dos testes e impedindo a formação e sincronização de pesagens válidas.
O veredicto final de prontidão para o Piloto é **NO-GO**.

## 2. Ambiente utilizado
- **Ambiente:** Testes E2E automatizados e CLI Utilitário em ambiente local acoplado ao PostgreSQL.
- **Comandos:** 
  - `PYTHONPATH=. .venv/bin/pytest tests/ -v`
  - `PYTHONPATH=. .venv/bin/python purge_delivery.py --dry-run`

## 3. Fluxo E2E executado
Foram analisados os fluxos clássicos de serviço (`test_standalone_service_order_station_weighing_observer_flow`), fluxos independentes (`test_avulsa_e2e.py`), os testes de segurança do Device e Bridge (`test_block_01k.py`, `test_block_01f.py`), além dos testes de integração do Delivery e Purge (`test_delivery_purge_e2e.py`, `test_delivery_receipt_e2e.py`).

## 4. Evidências PostgreSQL
- O comando `purge_delivery.py --dry-run` provou conectividade, queries RLS seguras e leitura atômica para retenção de 30 dias.
- Testes como `test_delivery_purge_e2e.py` injetaram com sucesso objetos de `DeliveryReceipt`, executaram o `purge` lógico, produziram os Hashes SHA-256 e salvaram a auditoria em `delivery_tombstones`. 

## 5. Testes negativos
- Cenários de `ACK` duplicado, expurgo de registros não-elegíveis (`PENDING` ou recém-ACK'd), bem como validação cruzada (Account A operando Receipt de Account B) foram bloqueados com sucesso.

## 6. Testes offline
- A captura de cenários offline de regressão base (`test_block_01k.py`) colapsou pela incapacidade de gerar/validar o `challenge` corretamente com os endpoints da arquitetura consolidada.

## 7. Segurança/RLS
- A segurança RLS se encontra aplicada e funcional. Toda consulta na tabela de `delivery_receipts` ou `delivery_tombstones` faz uso da diretiva PostgreSQL nativa `current_setting('app.current_tenant_id')`.

## 8. Integridade referencial
- O modelo `DeliveryTombstone` contém referências restritas (FK) e `ON DELETE CASCADE` apenas de `tara.pesagens` (Strategy A - Fato Físico mantido).

## 9. Regressões
Dos 21 testes no ecossistema atual:
- **17 PASSED**: O bloco de Outbox e de Delivery/Receipts funcionam integralmente.
- **4 FAILED**: Relativos ao bloco de Captura/Device.

## 10. GAPs

**GAP-01: Rejeição no Sync/Push (test_service_e2e.py e test_avulsa_e2e.py)**
- **Severidade:** CRÍTICA
- **Evidência:** `AssertionError: assert 'ERROR' == 'CREATED'` ao fazer HTTP POST para `/v1/stations/sync/push`.
- **Causa provável:** As simulações de pesagens enviadas na suíte legada de teste não incluíram as novas propriedades obrigatórias de prova criptográfica (Offline Proof / Bridge Token) adicionadas na fase `BALANCA-DEVICE-01J`. Logo, a API repeliu as sincronizações por falta de trust.
- **Menor correção sugerida:** Atualizar os dicionários (payload JSON) dos testes E2E legados para gerar a assinatura HMAC e as evidências offline esperadas pelo `push`.

**GAP-02: Endpoints de Challenge/Validation da Bridge falhando (test_block_01k.py, test_block_01f.py)**
- **Severidade:** CRÍTICA
- **Evidência:** `KeyError: 'challenge_id'` durante leitura de payload, além de `assert 422 == 201`.
- **Causa provável:** Respostas inesperadas das rotas do balcão `device/challenge` e `device/validate`. Podem ser falhas de sintaxe do JSON pydantic `422 Unprocessable Entity` ou alterações não ajustadas nas fixtures de teste após a auditoria `01K`.
- **Menor correção sugerida:** Realizar um dump do `response.text` nas invocações destes testes, avaliar os schemas de `in/out` Pydantic e ajustar os clients (testes) para formar a requisição da prova corretamente.

## 11. Matriz de readiness

| Etapa     | Resultado | Evidência | GAP |
| --------- | --------- | --------- | --- |
| Captura   | FALHA     | `test_service_e2e.py` rejeitou sync | GAP-01 |
| Offline   | FALHA     | `test_block_01k.py` Key Error challenge | GAP-02 |
| Sync      | FALHA     | `sync/push` ERROR response | GAP-01 |
| Pesagem   | N/A       | Bloqueado e não persistido pelo Sync | - |
| Outbox    | OK        | `test_outbox_delivery.py` PASS | - |
| Receipt   | OK        | `test_delivery_receipt_e2e.py` PASS | - |
| Pull      | OK        | `test_delivery_receipt_e2e.py` PASS | - |
| ACK       | OK        | `test_delivery_receipt_e2e.py` PASS | - |
| Retenção  | OK        | `test_delivery_purge_e2e.py` PASS | - |
| Purge     | OK        | `purge_delivery.py --dry-run` EXIT 0 | - |
| Tombstone | OK        | `test_delivery_purge_e2e.py` PASS | - |
| RLS       | OK        | Testes de Isolamento e RLS DB | - |

## 12. Veredicto

```text
BALANCA-DELIVERY-01E
STATUS: CONCLUÍDO

READINESS:
NO-GO
```

**Conclusão:** O sistema de consumo da Balança (Delivery, Pull, Ack e Expurgo) alcançou qualidade técnica inquestionável e isolamento absoluto de segurança, completando as metas da série `BALANCA-DELIVERY`. Todavia, o ambiente apresentou fragilidade nos contratos E2E do core de aquisição (DEVICE/STATION) no que tange às novas exigências de Prova Criptográfica Offline e Autenticação de Bridge. Como um Piloto exige a funcionalidade de ponta a ponta perfeitamente operante e sincrônica, declaramos prontidão vetada (`NO-GO`) até o fechamento corretivo dos GAPs.
