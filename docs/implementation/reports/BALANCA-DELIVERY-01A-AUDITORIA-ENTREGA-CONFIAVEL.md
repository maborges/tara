# BALANCA-DELIVERY-01A — Auditoria de Entrega Confiável de Pesagens

**Data:** 2026-08-24  
**Escopo auditado:** `/opt/lampp/htdocs/balanca-platform` e integração relevante em `/opt/lampp/htdocs/farm`  
**Fase executada:** A — Auditoria  
**Classificação:** **GO COM RESSALVAS**

## 1. Conclusão executiva

Existe uma base aproveitável para a entrega confiável: serviço independente,
schema próprio `balanca` no banco `farms`, contas/tenants internos, API Clients
com segredo armazenado como hash, RLS, pesagens idempotentes por `local_id`,
Outbox com retry e contingência assinada.

Entretanto, o requisito central desta tarefa ainda não está implementado:

```text
GET/entrega técnica != confirmação explícita do consumidor
```

O serviço não possui API de consulta de pesagens pendentes para o consumidor,
API de ACK, registro de `acknowledged_at`/credencial confirmadora, política de
retenção pós-ACK ou expurgo/tombstone. O `eventos_outbox.status = ENTREGUE`
significa apenas que o transporte HTTP/arquivo terminou sem erro; não prova que
o cliente persistiu a pesagem.

Há uma segunda ressalva de segurança: as credenciais de API e os tokens de
estação são validados contra `X-Tenant-ID` recebido do chamador. O requisito
desejado é resolver a conta exclusivamente pela credencial autenticada. Hoje,
um cliente que conheça outro UUID pode provocar uma consulta ao contexto desse
tenant, embora a combinação de credencial e tenant errado seja rejeitada. O
contrato ainda não atende ao modelo de ausência de tenant arbitrário no
consumidor.

O menor caminho seguro é uma implementação incremental no serviço Balança:
primeiro corrigir a resolução de conta/estação, depois introduzir a entrega
pull/ACK com uma única semântica de confirmação por conta, e só então adicionar
retenção/expurgo e observabilidade. Não é necessário reintroduzir Balança no
AgroSaaS, compartilhar models, criar FK entre produtos ou criar um segundo
Outbox.

## 2. Arquitetura encontrada

```text
Indicador físico
    ↓ serial/TCP
Bridge local
    ↓ HTTP/WebSocket local
Station PWA offline-first
    ↓ POST /v1/stations/pesagens ou /v1/stations/sync/push
Serviço Balança (FastAPI)
    ├── PostgreSQL database farms / schema balanca
    ├── ordens, pesagens, estações e operadores
    ├── eventos_outbox e worker de transporte
    └── contingência assinada por arquivo
    ↓ API existente de /v1/events ou entrega configurada
Consumidor, inclusive AgroSaaS
```

O repositório Balança é independente. No Farm, o adaptador
`services/api/integracoes/balanca/client.py` usa HTTP e headers de credencial;
não foi encontrada dependência de import de model/service do repositório
Balança no adaptador auditado. O Farm também mantém um núcleo legado de eventos
e integração; isso deve permanecer fora do contrato novo de entrega.

### Fontes principais

- Balança: `README.md`, `CONTEXTO_IA_PLATAFORMA_BALANCA.md`,
  `service/app/models.py`, `service/app/routes/integrations.py`,
  `service/app/security.py`, `service/app/auth.py`, migrations SQL e testes.
- Farm: `docs/architecture/adr-balanca-platform.md`,
  `services/api/integracoes/balanca/client.py`, `schemas.py`, `events.py`,
  `services/api/events/*` e `services/api/pecuaria/event_subscriber_balanca.py`.

## 3. Classificação das funcionalidades

### Existe e está correto ou aproveitável

- Serviço Balança separado do AgroSaaS.
- Banco e schema próprios: `farms.balanca`; não há necessidade de banco
  separado chamado `balanca`.
- `contas`, `clientes`, `api_clients`, `estacoes`, `operadores`, `ordens`,
  `pesagens` e `eventos_outbox` próprios.
- `ApiClient.secret_hash` guarda apenas SHA-256 do segredo; o segredo é
  retornado na criação/rotação, não na listagem/revogação.
- Pesagens possuem `id`, `local_id`, `ordem_id`, `etapa`, pesos, instante de
  captura e `UNIQUE (tenant_id, local_id)`.
- Ordens e pesagens criam evento `balanca.pesagem.concluida.v1` no Outbox na
  mesma transação lógica de conclusão.
- Outbox possui idempotência por `(tenant_id, idempotency_key)`, retry,
  `next_attempt_at`, contador e `last_error`.
- Entrega física de contingência possui assinatura ECDSA, hash, identidade da
  estação, sequência e idempotência de pacote.
- Station preserva a fila local IndexedDB e sincroniza por `local_id`.
- RLS está declarado para tabelas Balança com `app.current_tenant_id`.
- O Farm usa contrato HTTP e mantém adaptador sem FK/model compartilhado.

### Existe parcialmente

- O Outbox permite entrega push e consulta de eventos, mas não ACK de negócio
  técnico pelo consumidor. `ENTREGUE` é confirmação do transporte.
- Existe `GET /v1/events`, mas ele retorna Outbox diretamente, aceita apenas
  filtro simples de status, não é uma fila de pesagens PENDING com paginação e
  não tem ACK.
- A conta é representada por `Conta`, porém a autenticação ainda trata
  `tenant_id` como contexto fornecido pelo chamador. O `ApiClient` está ligado a
  tenant, mas não resolve a conta independentemente do header.
- A estação possui token próprio e token hash, porém sua autenticação também
  exige `X-Tenant-ID` e consulta `(tenant_id, token_hash)`.
- A contingência é recuperação de dados de pesagem, não provisionamento offline
  inicial de uma Station.
- O worker atual funciona para um único `BALANCA_OUTBOX_TENANT_ID` e um único
  alvo URL/arquivo configurado; não é ainda um roteador multi-conta com estado
  de confirmação por consumidor.
- A observabilidade existente cobre backlog do Outbox, mas não as métricas de
  PENDING/ACK/expurgo solicitadas.

### GAP

- Endpoint de consulta de pesagens ainda não confirmadas.
- Endpoint de ACK explícito, autenticado, autorizado, idempotente e auditável.
- Registro da conta proprietária, data do ACK e API Client que confirmou.
- Semântica formal para lote parcial/atômico e ACK concorrente.
- Estado/registro de entrega separado do estado de negócio da `Pesagem`.
- Política de retenção pós-ACK e job de expurgo.
- Tombstone mínimo ou evidência equivalente após expurgo.
- Proteção contra enumeração e definição de resposta para pesagem inexistente
  sem revelar propriedade de outra conta.
- Provisionamento offline assinado da Station, distinto da contingência de
  dados.
- Administração por conta para estações/API Clients, caso o modelo global
  desejado seja delegado ao cliente.

### Legado ou inconsistência

- `POST /v1/auth/login` exige `X-Tenant-ID`; o bootstrap exige
  `BALANCA_BOOTSTRAP_TENANT_ID`. Isso contradiz o Backoffice Global sem tenant
  documentado em `CONTEXTO_IA_PLATAFORMA_BALANCA.md`.
- `require_backoffice`, `require_client_context` e `require_station` exigem
  `X-Tenant-ID`; o cliente pode enviar um tenant arbitrário como parte da
  identidade de chamada.
- O README e o manual descrevem o modelo tenant-scoped, enquanto o contexto
  arquitetural mais recente descreve administrador global.
- A documentação do Farm prevê estados de entrega por consumidor, mas o
  serviço independente possui apenas uma linha Outbox por evento/tenant e um
  status técnico global. São conceitos diferentes e não devem ser confundidos.
- O fluxo legado do Farm ainda contém subscriber interno de eventos para
  Pecuária. Ele não deve ser usado como mecanismo de ACK da Plataforma Balança.

### Não implementar

- `PROCESSADA`, `FATURADA`, `CONCILIADA`, `ROMANEIO_GERADO` ou qualquer estado
  que represente decisão do consumidor.
- Modelos, services, tabelas ou FK compartilhados com AgroSaaS/DeepAgro.
- Um segundo Outbox paralelo somente para ACK.
- Marcação automática como confirmada após `GET`, HTTP 200 ou entrega do
  webhook.
- Exclusão automática de pesagem ainda PENDING.
- Workflow de negócio dentro da Balança.

## 4. Tabelas e modelos relevantes

| Entidade | Papel atual | Avaliação para entrega |
|---|---|---|
| `contas` | Conta proprietária, com `tenant_id` único | Deve ser a raiz da fila de entrega |
| `api_clients` | Credencial técnica, escopos, expiração, hash | Deve resolver a conta; registrar o client no ACK |
| `clientes` | Sistema/tenant externo contextual | Não substituir a conta proprietária |
| `estacoes` | Estação, token hash, identidade e status | Token deve resolver estação e conta sem header confiável |
| `ordens` | Solicitações do consumidor e status operacional | Não receber estados de entrega do consumidor |
| `pesagens` | Resultado físico persistido | Manter identidade e payload até expurgo permitido |
| `eventos_outbox` | Evento e transporte push/arquivo | Fonte possível do evento, mas status atual não é ACK |
| `contingencia_lotes/itens` | Importação física idempotente | Preservar para reconciliação técnica; não é entrega pull |

Ponto importante: `Pesagem` não possui `conta_id` explícito, mas possui
`tenant_id` e aponta para `Ordem`; `Ordem` aponta para `Cliente`; `Cliente`
aponta para `Conta`. Essa cadeia pode ser usada, desde que seja protegida por
restrições/consultas transacionais e validada contra inconsistências. Antes da
migration de entrega deve ser feito inventário de registros e checagem de
órfãos ou divergências nessa cadeia.

Não foi encontrado estado `ACKNOWLEDGED`, `PURGED` nem tabela de receipt/
tombstone no modelo do serviço.

## 5. Endpoints e autenticação atuais

### Endpoints observados

- `POST /v1/auth/login` — login humano tenant-scoped.
- `POST/GET /v1/admin/api-clients` e rotação/revogação — administração
  tenant-scoped.
- `POST /v1/clients` — cadastro contextual do sistema consumidor.
- `POST /v1/orders`, `GET /v1/orders` — criação pelo API Client e consulta
  administrativa.
- `POST/GET /v1/stations`, `POST /v1/stations/activate` — estação e ativação.
- `POST/GET /v1/operators` — operadores.
- `POST /v1/stations/pesagens` — captura online.
- `POST /v1/stations/sync/push`, `GET /v1/stations/sync/pull` — sincronização.
- `GET /v1/events` — leitura do Outbox pelo consumidor.
- `GET /v1/admin/events` — leitura administrativa do Outbox.
- `POST /v1/contingency/import` — importação de pacote assinado.

### Riscos de autenticação/autorização

1. `require_client_context` lê `X-Tenant-ID`, aplica RLS e só então procura o
   `ApiClient` por `client_id + tenant_id`. O tenant não é derivado somente da
   credencial.
2. `require_station` tem o mesmo padrão com `X-Tenant-ID + token_hash`.
3. O contrato do consumidor ainda exige headers secretos separados, sem um
   fluxo OAuth; isso é aceitável para a fase atual, desde que o segredo continue
   fora de logs e o tenant seja derivado do client.
4. `GET /v1/events` limita a 500, ordena por data descendente e expõe o estado
   global do Outbox; não há cursor, ordenação estável por ID ou controle de
   ACK.
5. Não há registro de tentativa de ACK, credencial revogada/expirada que
   tenha tentado confirmar, nem trilha de auditoria específica.

## 6. Fluxo Station → Service

O fluxo implementado é coerente para captura:

```text
Bridge → Station/IndexedDB → sync push → complete_weighing()
       → Pesagem + conclusão da Ordem + evento Outbox
```

O `local_id` e a restrição única suportam reenvio idempotente. A Station mantém
dados offline e o endpoint de sync devolve resultado por item.

Ressalvas:

- `sync/push` processa vários itens na mesma sessão, mas não documenta uma
  semântica completa de atomicidade; itens inválidos são retornados como erro e
  itens válidos podem ser persistidos no mesmo lote.
- Não foi encontrado teste específico de falha de reconexão com concorrência
  entre `POST /stations/pesagens` e `sync/push`.
- A autenticação da Station depende de tenant enviado pelo dispositivo.
- A contingência por pendrive importa pesagens já produzidas, mas não entrega
  confirmação ao sistema consumidor.

## 7. Fluxo Service → consumidor

### Push existente

`service/app/delivery.py` envia o envelope para uma URL HTTP ou acrescenta JSONL
em arquivo. Em sucesso, muda o Outbox para `ENTREGUE`; em falha, mantém
`PENDENTE`, incrementa tentativas e agenda retry exponencial.

Isso é útil e deve ser preservado, mas não satisfaz ACK explícito porque:

- o HTTP 2xx é decidido pelo transporte;
- não existe resposta de aplicação com confirmação durável;
- o status é único por evento/tenant, não por conta/consumidor independente;
- não existe `acknowledged_by_api_client` nem `acknowledged_at`;
- arquivo JSONL não tem confirmação de leitura/persistência.

### Pull existente

Não existe endpoint de pesagens para o consumidor. `GET /v1/events` apenas lista
linhas do Outbox e pode filtrar `PENDENTE`/`ENTREGUE`; consultar não altera o
estado, o que é correto, mas faltam a semântica e o contrato de ACK.

### Decisão de arquitetura

Não unificar artificialmente push e pull em um único status `ENTREGUE`.

Recomendação para a Fase B: manter `eventos_outbox` como fonte/evento e
transporte push, e criar uma abstração de entrega/receipt por conta consumidora
para a confirmação explícita. Essa abstração pode ser uma tabela própria de
entrega técnica vinculada a `Pesagem`/`Conta` ou uma extensão formal do modelo
de delivery existente, mas não deve reutilizar `Outbox.status = ENTREGUE` como
ACK. A escolha final deve ser precedida por inventário de dados e decisão
documentada, para evitar duas filas concorrentes.

## 8. Retenção e expurgo

Não foram encontrados campos ou rotinas de retenção/expurgo nas migrations,
models, rotas ou worker auditados. Também não há tombstone de pesagem.

Recomendação:

- primeiro persistir `acknowledged_at` e a identidade da credencial na entrega;
- calcular elegibilidade com `acknowledged_at + retention_period`;
- nunca aplicar essa política normal a PENDING;
- definir se a retenção é global ou por conta após verificar configuração já
  existente em produção;
- expurgar payload operacional em transação, preservando apenas a evidência
  mínima realmente necessária;
- usar job idempotente e métricas de elegibilidade/erro.

Não deve ser criada uma coluna `status = PURGED` em `Pesagem` sem decidir antes
se o conteúdo será removido da mesma linha. Um tombstone separado tende a ser
mais claro para preservar `weighing_id`, conta, estação, timestamps, hash e
credencial confirmadora sem manter o payload operacional.

## 9. Provisionamento das estações

### Online

Existe cadastro administrativo com `activation_code` e ativação por API Client,
retornando `station_token`. A Station usa o token Bearer. Isso é uma base válida,
mas precisa de um único contrato de identidade: hoje a implementação conserva
vestígios de `X-Tenant-ID` e há documentação anterior mencionando nomes
equivalentes `device_*`/`station_*`.

### Offline inicial

Não foi encontrada implementação de pacote assinado emitido pela plataforma
para ativar uma Station sem comunicação. O pacote existente é de contingência
Station → Plataforma e não resolve:

```text
Plataforma → pacote assinado → pendrive → Station
```

Isso é GAP separado da entrega confiável. Não deve ser misturado ao ACK de
pesagens; deve ser tratado em fase própria ou explicitamente deixado fora da
Fase B.

## 10. Auditoria do AgroSaaS/Farm

O adaptador `services/api/integracoes/balanca/client.py` chama a API Balança por
HTTP para criar ordens, clientes e operadores. Os contratos em
`services/api/integracoes/balanca/schemas.py` usam referências externas
(`client_system`, `client_tenant_id`, `external_reference`, `correlation_id`) e
não criam FK com a Balança.

O Farm possui um Outbox próprio (`services/api/events/*`) e subscriber interno
para eventos de Balança. Ele atende ao processamento interno do AgroSaaS e não
deve ser confundido com confirmação de entrega da Plataforma Balança. O
consumidor Farm deverá, na Fase B, consultar/confirmar pela API Balança ou usar
o transporte push com contrato explícito; o processamento posterior de
romaneio, pecuária, estoque ou faturamento permanece exclusivamente no Farm.

Não foi encontrada necessidade arquitetural de alterar models ou migrations do
Farm para implementar o ACK da Balança.

## 11. Migration de dados existentes

A auditoria de código não encontrou migration de entrega, ACK ou expurgo.
Também não foi executada nenhuma migration nesta fase.

Antes da Fase B, executar consulta somente leitura no banco `farms` para:

- contar `balanca.contas`, `ordens` e `pesagens`;
- identificar pesagens existentes;
- verificar a cadeia `pesagem → ordem → cliente → conta`;
- localizar registros com tenant/conta divergentes ou referências órfãs;
- verificar se existem duplicidades que conflitem com uma receipt por conta.

Registros históricos sem ACK não podem ser marcados como confirmados por
presunção. A migração deve tratá-los como não confirmados ou manter uma
classificação explicitamente documentada, sem perda silenciosa.

## 12. Testes existentes e cobertura ausente

### Encontrado

- `service/tests/test_service_e2e.py`: fluxo admin → API Client → ordem →
  estação → operador → sync → evento, além de rotação/revogação e isolamento
  básico.
- `service/tests/test_contingency_import.py`: assinatura, identidade,
  sequência e idempotência de pacote.
- `bridge/tests/*`: protocolo serial/TCP.
- Farm: contratos de integração Balança, testes de isolamento tenant e testes
  do Outbox global/observabilidade/worker.

### Ausente para BALANCA-DELIVERY-01

- criação de pesagem em estado PENDING de entrega;
- GET repetido sem ACK;
- ACK único, repetido e concorrente;
- isolamento de ACK entre contas;
- credencial revogada/expirada tentando consultar ou confirmar;
- pesagem inexistente sem enumeração;
- lote com semântica atômica/parcial definida;
- retenção baseada em `acknowledged_at`;
- PENDING inelegível ao expurgo;
- expurgo e evidência/tombstone;
- sincronização offline → online idempotente sob repetição real;
- métricas de pendência, antiguidade, ACK e elegibilidade.

## 13. Riscos prioritários

| Prioridade | Risco | Impacto |
|---|---|---|
| P0 | `ENTREGUE` pode ser interpretado como recebido pelo cliente | perda/duplicidade e falsa evidência de entrega |
| P0 | Não existe ACK explícito nem prova de quem confirmou | requisito central não atendido |
| P0 | Conta/tenant derivado de header do cliente | isolamento e contrato de identidade frágeis |
| P1 | Ausência de retenção/expurgo | retenção indefinida ou expurgo inseguro |
| P1 | Outbox único e worker single-tenant/configuração única | entrega multi-conta incompleta |
| P1 | Ausência de consulta paginada e ordenação estável | consumidor não consegue sincronizar com segurança em escala |
| P1 | Histórico sem ACK não classificado | migration pode presumir entrega indevidamente |
| P2 | Provisionamento offline inicial ausente | estação nova não pode ser ativada sem rede |
| P2 | Contingência preserva `raw_package` completo | retenção/minimização futura precisa ser definida |

## 14. Menor conjunto seguro de alterações para a Fase B

### Bloco 1 — identidade e isolamento

1. Criar/confirmar a identidade global do Backoffice sem `tenant_id`, sem
   misturá-la com a entrega.
2. Alterar a autenticação de API Client para resolver `ApiClient → Conta →
   tenant operacional` pela credencial, sem aceitar `X-Tenant-ID` como fonte de
   propriedade. Se o header permanecer temporariamente por compatibilidade,
   ele deve ser apenas verificado contra o contexto derivado, nunca usado para
   escolhê-lo.
3. Fazer o mesmo para token da Station: `station_token → Estacao → Conta`.
4. Adicionar testes multi-conta e RLS antes de expor os endpoints novos.

### Bloco 2 — entrega pull e ACK

1. Definir contrato versionado de consulta de pesagens/eventos pendentes, com
   paginação por cursor, ordenação determinística e IDs estáveis.
2. Persistir uma unidade de entrega por pesagem e conta, sem alterar estados de
   negócio da pesagem.
3. Implementar consulta que não muda estado.
4. Implementar ACK autenticado pelo API Client, transacional, idempotente e
   com política de lote definida.
5. Registrar `weighing_id`, conta, `acknowledged_at`, API Client e hash/metadata
   mínima de auditoria.
6. Definir respostas determinísticas para ID inexistente, duplicado, de outra
   conta e credencial inválida.

### Bloco 3 — retenção e expurgo

1. Definir a política de retenção efetiva existente; se não houver, iniciar com
   uma configuração global explícita e documentada.
2. Selecionar e migrar somente registros elegíveis por
   `acknowledged_at + retention_period`.
3. Criar job idempotente de expurgo e tombstone mínimo, sem payload de negócio.
4. Manter PENDING fora do expurgo normal.

### Bloco 4 — validação e documentação

1. Adicionar os testes obrigatórios do prompt ao serviço.
2. Testar o adaptador Farm somente no contrato HTTP, sem mudanças de domínio.
3. Atualizar OpenAPI/contratos e documentação operacional.
4. Adicionar métricas técnicas de PENDING, mais antiga, ACK, ACK recente,
   elegíveis e falhas.
5. Executar testes pertinentes, `git diff --check` e validações dos frontends
   apenas se forem alterados.

### Fora do menor conjunto

Provisionamento offline inicial, redesign completo do Backoffice Global e
substituição total do Outbox push não são necessários para comprovar o núcleo
de entrega confiável. Devem ser tratados separadamente, preservando os fluxos
existentes.

## 15. Critério de autorização para iniciar a Fase B

A Fase B pode começar de forma incremental após:

- confirmar por consulta read-only o inventário e a integridade das pesagens
  existentes;
- decidir se a receipt será uma tabela de entrega por conta ou extensão formal
  do modelo de delivery;
- congelar o contrato de resolução de conta sem tenant arbitrário;
- definir a semântica de ACK em lote;
- definir a política de retenção e a minimização do tombstone.

Até essas decisões, implementar somente testes de contrato/isolamento e não
criar migration de produção.

