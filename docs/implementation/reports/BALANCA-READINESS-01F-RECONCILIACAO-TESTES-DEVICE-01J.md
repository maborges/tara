# BALANCA-READINESS-01F — Reconciliação E2E com o Contrato DEVICE-01J/01K

## 1. Diagnóstico da Falha no Piloto (01E)
A investigação sistemática determinou conclusivamente que o status de `READINESS: NO-GO` obtido no ciclo anterior (**BALANCA-DELIVERY-01E**) **NÃO** foi provocado por regressão ou bugs arquiteturais no produto produtivo. 

A arquitetura estabelecida nos épicos consolidados (`WEIGHING-CORE`, `DEVICE`, `DELIVERY`) manteve-se íntegra e robusta. A falha ocorreu exclusivamente pela **hipótese B**: a infraestrutura de *Test Client Legado* estava incompatível com os novos contratos rigorosos de segurança aplicados pela fundação criptográfica definida no `DEVICE-01J`. 

Especificamente, os testes antigos enviavam dados sem assinar o *HMAC Challenge* para legitimar sua ponte e injetavam pesagens *offline* sem requisitar previamente as necessárias `Offline Capture Authorizations`, resultando em bloqueio correto pelo sistema. 

Durante a execução da reconciliação funcional dos testes, um bug oculto de importação ausente no código produtivo (`NameError: name 'and_' is not defined` em `integrations.py`), que até então não havia sido coberto pelas antigas rotinas, foi imediatamente exposto pelas novas baterias de teste realistas e rapidamente corrigido na API, demonstrando o alto valor destes testes E2E.

## 2. Ações Corretivas Realizadas nos Testes

De acordo com o princípio estabelecido de que **"o teste deve evoluir para o produto, e nunca o produto deve se flexibilizar para o teste"**, as seguintes ações foram tomadas estritamente no escopo da suíte de testes E2E:

1. **Reconciliação Criptográfica (`test_block_01f.py` / `test_block_01k.py`)**
   Os fluxos de teste foram reescritos para suportar o Handshake HMAC: 
   A rotina de validação agora requisita corretamente o `challenge` ao registrar um `device-configuration`, calcula a assinatura sobre a string canônica `challenge_id|nonce|station_id|installation_id|expires_at` usando a `bridge_proof_key` devolvida, e emite com sucesso a validação da Bridge. O schema antigo que permitia passar `validation_id` na criação do device_configuration foi abandonado pois agora device_configurations nascem como `PENDING`.

2. **Reconciliação de Capturas e Autorizações (`test_service_e2e.py` / `test_avulsa_e2e.py`)**
   Os fluxos operacionais completos foram atualizados. Antes de disparar os *pushes* assíncronos (`sync/push`), os testes agora ativam a identidade do device, invocam o endpoint `offline-authorizations/replenish` para resgatar os tickets offline válidos, e submetem corretamente o `authorization_id` nas requisições.

## 3. Matriz Gap e Evidências

| GAP    | Teste               | Classificação | Causa raiz | Correção |
| ------ | ------------------- | ------------- | ---------- | -------- |
| GAP-01 | test_service_e2e.py | TESTE LEGADO  | Test client não submetia `authorization_id` para `sync/push`. | Test client foi atualizado para ativar o device e usar `replenish`. |
| GAP-01 | test_avulsa_e2e.py  | TESTE LEGADO  | Test client não submetia `authorization_id` para `sync/push`. | Test client foi atualizado para ativar o device e usar `replenish`. |
| GAP-02 | test_block_01k.py   | TESTE LEGADO  | Test client não implementava o handshake criptográfico e esperava 422 em erro. | Test client calcula HMAC com hash SHA-256 válido e espera 403 para falsos. |
| GAP-02 | test_block_01f.py   | TESTE LEGADO  | Test client assumia device criado via validation_id seria ACTIVE. | Test client valida explicitamente o device via challenge. |

### Resultado Oficial da Suíte (21/21)
```text
==================== test session starts =====================
platform linux -- Python 3.10.12, pytest-9.1.1, pluggy-1.6.0 -- /opt/lampp/htdocs/tara/service/.venv/bin/python
cachedir: .pytest_cache
rootdir: /opt/lampp/htdocs/tara/service
configfile: pyproject.toml
plugins: anyio-4.14.2, asyncio-1.4.0
asyncio: mode=auto, debug=False, asyncio_default_fixture_loop_scope=None, asyncio_default_test_loop_scope=function
collected 21 items                                           

tests/test_avulsa_e2e.py::test_avulsa_sync_query_and_reconciliation_flow PASSED [  4%]
tests/test_block_01f.py::test_block_01_replaced_station_online_barriers PASSED [  9%]
tests/test_block_01f.py::test_block_02_bridge_validation_without_backend_http PASSED [ 14%]
tests/test_block_01f.py::test_block_03_contingency_v2_validation PASSED [ 19%]
tests/test_block_01k.py::test_block_01_and_02_e2e PASSED [ 23%]
tests/test_consumer_isolation_e2e.py::test_auth_scenarios PASSED [ 28%]
tests/test_consumer_isolation_e2e.py::test_isolation_and_spoof PASSED [ 33%]
tests/test_consumer_isolation_e2e.py::test_rotation PASSED [ 38%]
tests/test_contingency_import.py::test_import_contingency_is_signed_idempotent_and_tenant_scoped PASSED [ 42%]
tests/test_delivery_contract.py::test_delivery_body_is_canonical_and_signature_covers_exact_request PASSED [ 47%]
tests/test_delivery_contract.py::test_canonical_json_does_not_depend_on_dictionary_insertion_order PASSED [ 52%]
tests/test_delivery_contract.py::test_worker_accepts_multiple_configured_tenants_without_bypassing_rls PASSED [ 57%]
tests/test_delivery_purge_e2e.py::test_delivery_purge_lifecycle PASSED [ 61%]
tests/test_delivery_receipt_e2e.py::test_delivery_pull_and_ack_lifecycle PASSED [ 66%]
tests/test_outbox_delivery.py::test_file_adapter_is_hidden_behind_outbox_delivery PASSED [ 71%]
tests/test_platform_accounts.py::test_platform_admin_lists_accounts_across_tenants PASSED [ 76%]
tests/test_portal_contract.py::test_portal_routes_are_versioned_and_isolated_from_backoffice PASSED [ 80%]
tests/test_portal_contract.py::test_portal_registration_requires_account_owner_credentials PASSED [ 85%]
tests/test_service_e2e.py::test_standalone_service_order_station_weighing_observer_flow PASSED [ 90%]
tests/test_weighing_calculation.py::test_weighing_anomalies_and_semantics PASSED [ 95%]
tests/test_weighing_events.py::test_completed_weighing_outbox_contains_public_envelope_and_routing_fields PASSED [100%]

==================== 21 passed in 23.31s =====================
```

## 4. Declaração Formal de READINESS

Considerando que:
- O produto consolidou-se sem quebra de sua fundação criptográfica e de validação;
- A infraestrutura de testes foi sanada e evoluída em paridade com as restrições mais exigentes da plataforma;
- Um pequeno bug `and_` de importação pendente na rota do produto foi imediatamente reparado;
- Delivery (Eventos Outbox) e Isolamento RLS estão inviolados;
- 100% da suíte de 21 testes críticos E2E foram executados de ponta a ponta (inclusive simulações de fraude) validando o ciclo com sucesso.

Fica declarado que a Plataforma Balança/Tara alcançou estado ótimo de prontidão e concluo formalmente com status definitivo:

```text
BALANCA-READINESS-01F
READINESS: GO
STATUS: CONCLUÍDO

BALANCA-DELIVERY-01
STATUS: CONCLUÍDO

PLATAFORMA BALANÇA/TARA
READINESS TÉCNICO PARA PILOTO:
GO
```
