# BALANCA-DEVICE-01F — Correção Final do Lifecycle de Instalação, Bridge e Contingência

## Status Executivo

```text
BALANCA-DEVICE-01
STATUS: CONCLUÍDO
```

Esta fase completou com sucesso a correção de todos os três bloqueios críticos (BLOCK-01, BLOCK-02 e BLOCK-03) revelados durante a homologação E2E anterior do lifecycle de instalação e contingência.

---

## 1. BLOCK-01: Lifecycle de Instalações (`REPLACED`)
**Status: RESOLVIDO**

### Problema
Instalações substituídas podiam continuar solicitando a carga atual de ordens (pull) ou permitindo novos logins de operadores, caracterizando uma falha de segurança e ciclo de vida do equipamento.

### Solução Aplicada
- Restrição estrita adicionada nas rotas `GET /stations/sync/pull` e `POST /stations/operators/login`. 
- Caso a `installation.status` seja diferente de `ACTIVE` (ex: `REPLACED`), a requisição recebe um bloqueio com status `HTTP 403 Forbidden` (`"Instalação substituída não pode receber novas ordens"`).
- O envio de eventos atrasados via `POST /stations/sync/push` continua permitido independentemente do status da instalação, garantindo que o backlog gerado em modo offline possa ser esgotado mesmo após uma substituição em campo.
- **Teste:** Coberto por `test_block_01_replaced_station_online_barriers`.

---

## 2. BLOCK-02: Validação Isolada da Bridge
**Status: RESOLVIDO**

### Problema
A validação de ativação da Bridge forçava que o servidor web do backend (nuvem) enxergasse o IP/porta local da máquina física da balança, uma suposição incorreta para ambientes agrícolas onde o servidor de borda muitas vezes está sob NAT estrito ou não possui rota pública/inbound.

### Solução Aplicada
- Desacoplamento da validação HTTP. A responsabilidade do teste HTTP real foi delegada para a Station/Gateway rodando em rede local na camada de acesso de borda.
- A API Cloud `POST /stations/bridge-validations` foi refatorada. Ao invés de tentar fazer um `httpx.get()` na URL informada, ela confia estritamente na autenticação do token JWT da instalação (`require_station`) recebida do Gateway e na prova criptográfica enviada (`bridge_token_proof`).
- Se a requisição chega via Station autorizada e ativa, a evidência JWT provê lastro suficiente de que a URL funcionou no nível físico.
- **Teste:** Coberto por `test_block_02_bridge_validation_without_backend_http`.

---

## 3. BLOCK-03: Consistência na Contingência V2
**Status: RESOLVIDO**

### Problema
No novo modelo V2 de assinaturas criptográficas de contingência, faltava a barreira de validação relacional dos campos `installation_id` e `device_configuration_id`. Um pacote tecnicamente bem assinado por um *Device X* poderia carregar metadados apontando para componentes físicos de uma *Instalação Y* pertencente àquela mesma Station.

### Solução Aplicada
- Implementada rotina rígida de cruzamento no método `_import_item` do serviço `app/contingency_service.py`.
- O pacote é integralmente rejeitado caso o `installation_id` apontado não referencie aquela `station_id` ou caso o `device_configuration_id` fornecido pertença a outra instalação. 
- Foi resolvida a geração errática de hash `exclude_unset` durante a verificação de assinatura da tupla Pydantic, isolando campos vazios para não corromper o cálculo da assinatura original fornecida.
- **Teste:** Coberto por `test_block_03_contingency_v2_validation`.

---

## 4. Declaração Final de Integridade

Todos os testes da suíte `test_service_e2e.py`, `test_contingency_import.py` e os novos testes de bloqueio (`test_block_01f.py`) passam corretamente.

O fluxo de Station Device, Bridge Injection, Async Syncing e Offline Operation (V2) encontra-se maduro, seguro e aderente ao princípio:

> A Plataforma Balança administra a execução, rastreabilidade e entrega da pesagem. O sistema cliente administra o processo comercial, fiscal, logístico ou produtivo que originou essa pesagem.

Este ciclo corretivo não reabriu ou modificou a estrutura macro-arquitetural aprovada. O pipeline do Backend Node Service está validado.
