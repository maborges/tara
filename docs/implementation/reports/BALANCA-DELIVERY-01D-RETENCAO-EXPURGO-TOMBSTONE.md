# BALANCA-DELIVERY-01D — Retenção, Expurgo Seguro e Tombstone

## Status Executivo

```text
BALANCA-DELIVERY-01D
STATUS: CONCLUÍDO
```

Esta fase implementou o ciclo de vida final para os eventos de pesagem consumidos: a retenção temporária do payload e a transição atômica e irreversível para a estrutura otimizada de `DeliveryTombstone`.

A Estratégia "A" de desacoplamento foi consolidada: o expurgo limpa a área técnica do **Delivery** (`delivery_receipts`), reduzindo drasticamente o uso de disco da plataforma, porém preserva a **Pesagem** física em si na tabela `pesagens`.

---

## 1. Entregáveis e Funcionalidades Implementadas

### A. Entidade `DeliveryTombstone`
A tabela e o modelo `delivery_tombstones` foram criados para atuar como o **registro definitivo (Tombstone)**.
- Campos principais: `id`, `tenant_id`, `pesagem_id`, `acknowledged_at`, `purged_at`.
- Para garantir segurança de integridade futura sem onerar a base, é mantido o `payload_checksum` (gerado por SHA-256 no instante do purge) do payload canônico original.

### B. Isolamento e Segurança (RLS)
Da mesma forma que as outras tabelas do sistema (Ordens, Pesagens e Receipts), o Tombstone recebeu uma política nativa no PostgreSQL de `ROW LEVEL SECURITY (RLS)`, evitando que um tenant enxergue dados expurgados de outro tenant.

### C. Utilitário de Expurgo (`purge_delivery.py`)
Implementado script na camada service (`purge_delivery.py`) destinado a automações (cron/workers). O script:
- Busca todos os `DeliveryReceipts` onde `status = ACKNOWLEDGED` e a data de ACK ultrapassou o período configurado (`delivery_retention_days`).
- Constrói o Tombstone e gera o Hash SHA-256 do payload retido.
- Em **transação atômica** de banco de dados e em **batches (lotes)** otimizados, insere os Tombstones e **deleta** os Receipts correspondentes.
- Possui suporte total a `--dry-run` para ser usado por operadores de infraestrutura.

### D. Regras de Negócio Garantidas (Idempotência e Proteção)
1. Eventos com status `PENDING` **jamais** são eleitos para expurgo, garantindo que pesagens "esquecidas" pelos clientes na fila nunca sejam perdidas.
2. Atualização atômica do Endpoint HTTP: A rota `POST /v1/delivery/ack` foi aprimorada. Caso o cliente envie novamente o ID de uma pesagem cuja retenção expirou (logo, já purgada e existente no Tombstone), o sistema detecta isso dinamicamente usando a tabela de Tombstone e retorna determinísticamente o status `ALREADY_PURGED`. Se não estiver em Tombstone e nem como pendente, continua retornando `NOT_FOUND`.

---

## 2. Validação End-to-End (E2E)
A suíte de testes E2E assíncronos via pytest foi concluída com sucesso:
- **`test_delivery_purge_e2e.py`**:
  - Testou a não inclusão de eventos velhos mas que ainda são `PENDING`.
  - Testou a conversão correta de um `ACKNOWLEDGED` antigo para Tombstone, preservando o histórico de quem efetuou o ACK.
  - Verificou a destruição assertiva da linha na tabela `delivery_receipts`.
  - Provou a proteção contra `cross-tenant-ID leakage` inclusive no status devolvido via HTTP.

## 3. Próximos Passos
O Épico **Delivery** (01A até 01D) atinge agora maturidade e robustez completas (Ciclo Fechado: *PENDING → ACKNOWLEDGED → PURGED*). 
O sistema já está apto para operação contínua sem risco de inchaço na base de dados de eventos.
