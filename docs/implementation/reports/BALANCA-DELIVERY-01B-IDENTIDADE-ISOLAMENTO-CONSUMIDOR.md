# BALANCA-DELIVERY-01B — Identidade, Autenticação e Isolamento do Consumidor

## Status Executivo

```text
STATUS: CONCLUÍDO
```

Todas as metas de isolamento e validação de identidade estipuladas pela fase `01B` foram formalmente comprovadas através de uma base de código robusta e baterias de testes end-to-end.

A principal descoberta da auditoria desta fase foi que **a arquitetura da Plataforma Balança já implementa integralmente os requisitos mais estritos de identidade baseada em Credencial, desconsiderando completamente o header vulnerável `X-Tenant-ID` para consumidores externos.**

---

## 1. Auditoria e Matriz de Identidade

A auditoria confirmou que todos os endpoints externos do Gateway do Consumidor operam isolados da identidade livre (Spoofável).

A cadeia de resolução de autoridade atende exatamente à regra canônica exigida pelo épico:
`API Credential -> API Client -> Consumer Account -> Tenant/Account Context`

### Inventário de Endpoints Externos do Consumidor

| Endpoint | Autenticação atual | Origem do tenant/account | Seguro? | Ação Realizada |
| -------- | ------------------ | ------------------------ | ------- | -------------- |
| `POST /v1/clients` | `require_client_context` | `ApiClient.tenant_id` via Hash | SIM | Nenhuma (Preservado) |
| `POST /v1/orders` | `require_client_context` | `ApiClient.tenant_id` via Hash | SIM | Nenhuma (Preservado) |
| `GET /v1/orders` | `require_client_context` | `ApiClient.tenant_id` via Hash | SIM | Nenhuma (Preservado) |
| `GET /v1/weighings` | `require_client_context` | `ApiClient.tenant_id` via Hash | SIM | Nenhuma (Preservado) |
| `GET /v1/events` | `require_client_context` | `ApiClient.tenant_id` via Hash | SIM | Nenhuma (Preservado) |

---

## 2. Implementação e Defesas em Profundidade

O sistema se beneficia de uma arquitetura de *Defense in Depth* que atua em três camadas perfeitamente alinhadas:

1. **Contexto de Autenticação (`security.py`)**: A dependência `require_client_context` atua de forma análoga a um `resolve_consumer_identity()`. Ela descarta e proíbe a leitura de `X-Tenant-ID` nos endpoints externos. A identidade do Account (Tenant) é extraída obrigatoriamente do banco de dados, validando o `client_id` contra o `secret_hash`.
2. **Contexto de Banco de Dados (`set_tenant_context`)**: O sistema insere a identidade descoberta diretamente na transação do banco via `app.current_tenant_id`.
3. **Isolamento Físico (RLS)**: O PostgreSQL está operando com `ENABLE ROW LEVEL SECURITY` nas tabelas `pesagens`, `ordens` e `eventos_outbox`. Isso significa que qualquer tentativa de vazar contexto na camada de aplicação ainda colidirá na barreira nativa do banco de dados, que barra qualquer operação onde a conta do recurso não coincida com o `app.current_tenant_id`.

---

## 3. Validação End-to-End

A suíte de testes `service/tests/test_consumer_isolation_e2e.py` foi escrita e incluída no pipeline para gerar evidências imutáveis destas defesas.

### Cenários Aprovados

- **`test_auth_scenarios`**: Comprova que credenciais válidas acessam a API, enquanto tokens inválidos, expirados por tempo (`expires_at`), ou cujo status foi transitado para `REVOGADO`, sofrem bloqueio sumário (HTTP 401).
- **`test_isolation_and_spoof`**: Demonstrou que uma Credential A inserindo cabeçalho `X-Tenant-ID: B` ou query params `?tenant_id=B` tem as injeções seguramente **ignoradas**. A consulta continuou retornando exclusivamente os dados da conta A. Qualquer inserção direta cruzada dispara erro nativo de RLS (`InsufficientPrivilegeError: new row violates row-level security policy`).
- **`test_rotation`**: Validou o funcionamento impecável de múltiplas versões do mesmo Client Secret operando em transição de disponibilidade (zero-downtime) e o corte de acesso assim que o secret antigo é revogado.

## Conclusão
A fundação de autenticação e identidade de consumidores está arquiteturalmente madura e segura. O sistema está pronto para avançar para as próximas fases do lifecycle de mensageria assíncrona sabendo que o `account_id` que assina os pacotes de Outbox é absolutamente inviolável.
