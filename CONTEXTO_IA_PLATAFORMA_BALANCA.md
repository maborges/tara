# Contexto para IA — Plataforma Balança

Documento de contexto técnico para qualquer IA que analise, altere ou
implemente código neste projeto.

## 1. O produto

A Plataforma Balança é um produto independente para operar pesagens. Ela
conecta indicadores físicos, estações de trabalho, operadores, clientes
consumidores e sistemas externos como o AgroSaaS.

Responsabilidades da plataforma:

- administrar contas/clientes consumidores e credenciais de integração;
- administrar estações e operadores;
- criar e acompanhar ordens de pesagem;
- capturar pesagens online e offline;
- integrar indicadores físicos por serial/TCP;
- armazenar ordens, pesagens e eventos;
- entregar resultados aos sistemas clientes;
- manter rastreabilidade, idempotência e contingência.

O AgroSaaS não deve importar modelos, services ou código interno da Balança.
A fronteira entre os produtos é HTTP, eventos e contratos compartilhados.

## 2. Arquitetura geral

```text
Administrador global
        ↓
Backoffice Administrativo Global
        ↓
Serviço/API Balança
        ├── PostgreSQL farms, schema balanca
        ├── APIs para clientes consumidores
        ├── APIs para estações
        └── Outbox/worker de eventos
                ↓
        Estação PWA
                ↓
        Bridge local
                ↓
        Indicador físico
```

O cliente consumidor, como o AgroSaaS, não acessa o banco da Balança.

## 3. Componentes

```text
balanca-platform/
├── service/       API, autenticação, RBAC, banco, ordens e outbox
├── backoffice/    aplicação web administrativa global
├── station/       PWA offline-first da estação
├── bridge/        serviço local próximo ao indicador
├── contracts/     contratos compartilhados
└── docs/          documentação operacional
```

### Service

FastAPI independente. Arquivos principais:

- `service/app/main.py` — aplicação;
- `service/app/routes/integrations.py` — endpoints;
- `service/app/security.py` — autenticação/RBAC;
- `service/app/auth.py` — tokens de estação;
- `service/app/service.py` — regras de domínio;
- `service/app/models.py` — modelos SQLAlchemy;
- `service/app/delivery.py` — entrega do outbox;
- `service/run_worker.py` — worker.

### Backoffice

É a administração global da Plataforma Balança. Não é uma área de um cliente
consumidor e seu login não deve exigir `Tenant ID`.

Funcionalidades esperadas:

- login global;
- gestão de contas/clientes consumidores;
- gestão de API clients/API Keys;
- gestão de escopos e endpoints de eventos;
- gestão de estações e operadores;
- monitoramento de ordens, pesagens e outbox;
- contingência, replay e auditoria.

O frontend atual já possui base visual para credenciais, estações, operadores,
ordens e eventos, mas o login ainda está baseado no modelo antigo tenant-scoped.

### Station

PWA instalada no computador/tablet da balança. Responsabilidades:

- ativação;
- login do operador por PIN;
- sincronização de ordens;
- captura e confirmação da pesagem;
- IndexedDB/Dexie;
- operação offline;
- fila de sincronização;
- exportação de contingência assinada.

Arquivos importantes:

- `station/src/lib/db.ts` — IndexedDB e filas;
- `station/src/lib/api.ts` — API da estação;
- `station/src/lib/sync/pull.ts` — download de ordens;
- `station/src/lib/sync/push.ts` — envio de pesagens;
- `station/src/lib/contingency.ts` — pacote assinado;
- `station/src/app/api/v1/[...path]/route.ts` — proxy;
- `station/src/app/(balanca)/pesagem/page.tsx` — operação.

### Bridge

Serviço local Python que:

- conecta ao indicador via RS232/USB ou TCP;
- interpreta frames;
- normaliza unidades para kg;
- detecta estabilidade;
- expõe leitura por HTTP/WebSocket.

Endpoints:

```text
GET /health
GET /peso-atual
WS  /ws/peso
```

A Bridge deve funcionar na rede local sem depender da internet.

## 4. Identidade e entidades

O modelo correto separa as seguintes entidades:

### Administrador global

Usuário da Plataforma Balança. Faz login sem tenant e administra toda a
plataforma.

### Conta/cliente consumidor

Organização ou sistema externo que usa a plataforma.

### API client/API Key

Credencial técnica emitida para uma conta consumidora. Possui:

- `client_id`;
- `client_secret`, exibido somente na criação/rotação;
- escopos;
- status;
- expiração;
- último uso;
- conta associada.

O segredo nunca deve ser armazenado em texto puro.

### Tenant operacional

Identidade interna da conta/cliente usada para isolamento dos dados de
ordens, estações, operadores e pesagens.

### Cliente operacional

Registro contextual usado nas ordens/eventos para identificar o sistema e o
tenant externo de origem. Não confundir com a conta consumidora da plataforma.

## 5. Banco de dados

O banco correto é:

```text
PostgreSQL database: farms
PostgreSQL schema: balanca
```

Não criar um banco separado chamado `balanca`.

As migrations de `service/migrations/` criam tabelas próprias no schema
`balanca`, incluindo contas, clientes, api_clients, usuários, papéis,
permissões, estações, operadores, ordens, pesagens, outbox e contingência.

O AgroSaaS usa o schema `farms` e não deve compartilhar tabelas, modelos ou
Foreign Keys com a Balança.

## 6. Bootstrap e login administrativo

O fluxo correto é:

```text
Instalação
    ↓
bootstrap local do primeiro administrador global
    ↓
login global: login + senha
    ↓
Backoffice sem Tenant ID
```

O bootstrap deve ser local e protegido, não um endpoint público. A identidade
de entrada é criada em `balanca.administradores_plataforma`; o vínculo com um
tenant operacional inicial é mantido temporariamente para as telas legadas de
operação. O script `service/bootstrap_admin.py` exige
`BALANCA_BOOTSTRAP_TENANT_ID` apenas no bootstrap, não no login.

## 7. Fluxo administrativo

```text
Administrador global entra no Backoffice
        ↓
Cadastra conta/cliente consumidor
        ↓
Gera API client
        ↓
Define escopos e endpoint de eventos
        ↓
Entrega client_id + client_secret ao cliente
        ↓
Cadastra estações e operadores
```

O cliente consumidor não deve acessar a tela administrativa global.

## 8. Fluxo do cliente consumidor

O cliente usa suas credenciais para criar ordens:

```http
POST /v1/orders
X-Balanca-Client-ID: ...
X-Balanca-Client-Secret: ...
```

Payload conceitual:

```json
{
  "client_system": "agrosaas",
  "client_tenant_id": "tenant-externo",
  "external_reference": "agricola:romaneio:UUID",
  "correlation_id": "UUID",
  "subject_type": "VEICULO",
  "tipo_pesagem": "UNICA",
  "contexto": {}
}
```

O serviço deve resolver a conta/tenant pela credencial autenticada. O cliente
não deve escolher livremente o tenant por header.

Escopos atuais:

```text
clients:write
orders:write
events:read
stations:activate
```

## 9. Fluxo da estação

```text
1. Administrador cria estação no Backoffice
2. Serviço gera código de ativação
3. Operador ativa a PWA
4. Estação recebe token próprio
5. Estação sincroniza ordens pendentes
6. Operador entra com PIN
7. PWA consulta peso da Bridge
8. Operador confirma a pesagem
9. PWA salva localmente e coloca na fila
10. Sync push envia quando há conexão
11. Serviço grava pesagem e conclui a ordem
```

O token deve identificar a estação e permitir resolver a conta sem depender
de um `X-Tenant-ID` fornecido pelo dispositivo.

## 10. Operação offline

```text
Bridge → PWA → IndexedDB → sync_queue → API quando a conexão retorna
```

A PWA deve continuar permitindo visualizar ordens já sincronizadas, selecionar
operador, capturar peso e mostrar pendências.

Estados da fila:

```text
PENDING → IN_FLIGHT → DONE
                    ↘ FAILED
```

`local_id` é a chave idempotente da pesagem. Nunca apagar dados locais
pendentes automaticamente.

## 11. Conclusão da pesagem

Ao receber uma pesagem o serviço deve:

1. autenticar a estação;
2. validar a ordem;
3. verificar duplicidade por `local_id`;
4. gravar peso informado, aferido e tara;
5. calcular peso líquido;
6. concluir a ordem;
7. criar evento no outbox.

Evento canônico:

```text
balanca.pesagem.concluida.v1
```

O envelope deve conter `event_id`, `idempotency_key`, versão, horário,
conta, sistema cliente, tenant externo, correlação, referência externa,
entidade e payload.

## 12. Outbox e entrega

```text
Pesagem concluída
    ↓ mesma transação
Outbox PENDENTE
    ↓ worker
Entrega HTTP assinada
    ↓
Cliente consumidor
```

O cliente receptor deve processar eventos por `event_id` e
`idempotency_key`.

Para produção, o outbox precisa suportar:

- destino por cliente/conta;
- assinatura HMAC por cliente;
- retry com backoff;
- dead-letter;
- replay manual;
- ack do receptor;
- observabilidade por cliente;
- isolamento entre clientes.

O worker atual usa uma configuração simples de tenant e URL e ainda precisa
ser evoluído para um outbox multi-conta.

## 13. Contingência

```text
Pesagens locais
    ↓
Pacote .balanca.json assinado
    ↓
Pendrive
    ↓
Importação no serviço/Backoffice
    ↓
Validação e reconciliação
```

O pacote deve validar versão, assinatura, estação, conta, sequência,
duplicidade e registros individuais.

## 14. Inconsistências conhecidas

1. O login do Backoffice ainda é tenant-scoped, mas deve ser global.
2. O bootstrap atual exige `BALANCA_BOOTSTRAP_TENANT_ID`.
3. Ainda não existe administrador global persistido.
4. A ativação da estação tem diferenças entre PWA e serviço independente:
   `device_token/device_id` versus `station_token/station_id`.
5. A estação mantém proxy de compatibilidade herdado do monólito.
6. A entrega do outbox usa configuração simples por tenant/processo.
7. Faltam destino por cliente, assinatura HMAC, dead-letter e replay completo.
8. A Bridge permite CORS amplo e token vazio por padrão.
9. A importação de contingência precisa ser concluída visualmente no
   Backoffice.
10. “Cliente” ainda representa entidades diferentes no código.

## 15. Regras para futuras alterações

1. Não restaurar `services/api/balanca/` do AgroSaaS.
2. Não criar dependência de banco entre AgroSaaS e Balança.
3. Não usar Tenant ID no login global do Backoffice.
4. Não tratar API client como usuário humano.
5. Não expor `client_secret` em listagens.
6. Resolver tenant/conta pela credencial autenticada sempre que possível.
7. Manter `local_id`, `event_id` e `idempotency_key` estáveis.
8. Preservar operação offline e filas locais.
9. Versionar contratos de API e eventos.
10. Atualizar testes e documentação junto com mudanças de contrato.
11. Verificar os dois projetos: `/opt/lampp/htdocs/balanca-platform` e
    `/opt/lampp/htdocs/farm`.

## 16. Estado conhecido

- Backoffice possui telas de credenciais, estações, operadores, ordens e
  eventos;
- typecheck, lint e build do Backoffice passam no estado validado;
- serviço possui migrations para `farms.balanca`;
- Bridge possui testes de protocolo e TCP;
- serviço possui testes E2E e de contingência, mas o ambiente virtual pode
  não ter `pytest` instalado;
- distinguir sempre o que já existe do que é arquitetura desejada e ainda
  está pendente.
