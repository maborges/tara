# BALANCA-DELIVERY-01C — Pull Idempotente, DeliveryReceipt e ACK Explícito

## Status Executivo

```text
BALANCA-DELIVERY-01C
STATUS: CONCLUÍDO
```

## Resumo das Entregas

Nesta fase foi concluído o lifecycle PENDING → ACKNOWLEDGED da entrega de pesagens para sistemas consumidores, em total conformidade com a arquitetura definida.

### 1. Separação de Responsabilidades (Regra de Ouro)
Foi implementada a tabela dedicada `tara.delivery_receipts`, garantindo a separação definitiva entre:
- **Pesagem:** fato físico imutável.
- **Outbox:** evento técnico efêmero.
- **DeliveryReceipt:** estado da entrega rastreável para um cliente externo.

O `DeliveryReceipt` agora armazena de forma imutável o *payload canônico* completo da pesagem gerado no instante de sua conclusão. Portanto, o expurgo (purge) do Outbox de eventos técnicos nunca destruirá o objeto que precisa ser entregue ao consumidor, garantindo resiliência temporal da integração assíncrona.

### 2. Idempotência do Fluxo de PULL
Foi criado o endpoint `GET /v1/delivery/pending`:
- As chamadas de pull não alteram o estado da mensagem (só transitam para ACK após uma requisição explícita).
- Os clientes podem consumir as pesagens quantas vezes precisarem caso o processamento falhe do lado deles.
- A ordenação usa timestamp + ID opaco (cursor) resolvendo paginações consistentes.

### 3. Confirmação (ACK) Explícita e Rastreada
O endpoint `POST /v1/delivery/ack`:
- Marca as pesagens informadas como `ACKNOWLEDGED`.
- Rastreia rigorosamente não apenas **quando** foi feito, mas **quem** fez (`acknowledged_by_api_client_id` e a exata credencial `acknowledged_by_credential_id`).
- É projetado para ser **idempotente** (ACKs repetidos retornam `ALREADY_ACKNOWLEDGED` sem sobrescrever o momento original da entrega).

### 4. RLS e Cross-Account Seguros
Nenhum ID de cliente ou conta (`tenant_id`) precisa ser enviado na request. Toda a identidade é resolvida via autenticação (API Key / Client Secret). A tabela `delivery_receipts` foi amparada por Políticas de RLS rigorosas:
- O consumidor `A` acessando `GET /delivery/pending` vê apenas Receipts de `A`.
- Uma tentativa de dar ACK via `POST /delivery/ack` numa pesagem do consumidor `B` resulta automaticamente no status `NOT_FOUND` com segurança de banco de dados, impossibilitando bypass no nível de código.

### 5. Atomicidade via DB
O ciclo de vida original da pesagem em `app/operation.py` foi atualizado: o momento onde `sync_weighing()` transita o peso para PUSH via Outbox agora insere simultaneamente o `DeliveryReceipt`. Tudo isso orquestrado dentro da mesma transação atômica. Se qualquer passo falhar (banco offline), nenhuma pesagem fica em estado "fantasma".

## Verificação E2E Realizada
Uma suíte completa assíncrona (`test_delivery_receipt_e2e.py`) comprovou na prática, sem mocks:
- Múltiplas pesagens criadas independentemente.
- Autenticações cruzadas entre Contas `A` e `B` não vazando dados.
- Respostas `200 OK` para ACK repetido (`ALREADY_ACKNOWLEDGED`).
- Falta de escopos `delivery:read` sendo bloqueados como deviam.
