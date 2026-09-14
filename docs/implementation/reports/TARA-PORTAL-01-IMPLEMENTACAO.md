# TARA-PORTAL-01 — Portal do Cliente

O procedimento operacional completo para implantação por API, Webhook ou
modelo híbrido está em [docs/IMPLANTACAO_CLIENTE.md](../../IMPLANTACAO_CLIENTE.md).

**Status:** MVP implementado  
**Escopo:** autoatendimento de conta, gestão de integrações e visão operacional
**Independência:** não importa código, model, service ou tabela do AgroSaaS

## Resultado

Foi criada uma aplicação própria em `portal/`, separada do Backoffice Global.
O cliente pode criar sua conta, autenticar-se e administrar as credenciais
técnicas da própria conta, acompanhar os processos de pesagem e consultar os
indicadores operacionais isolados da Conta.

## Funcionalidades entregues

- cadastro da conta e do primeiro administrador;
- login próprio do Portal do Cliente;
- JWT separado do JWT do Backoffice;
- resolução do tenant pela sessão autenticada;
- endpoint `/v1/portal/me`;
- listagem de API Clients sem segredo;
- criação de API Keys;
- rotação de API Keys;
- revogação de API Keys;
- exibição única do `client_secret` no frontend;
- isolamento das operações por `tenant_id` e RLS;
- interface responsiva baseada nos padrões visuais observados no AgroSaaS;
- estados de carregamento, vazio, erro e confirmação.
- visão geral gerencial da Conta no Portal;
- consulta de processos com busca e filtro por status;
- consulta de ordens de pesagem e pesagens da própria Conta;
- dashboard específico de uma Conta no Backoffice para suporte operacional.

## Estrutura

```text
portal/
├── src/app/                 # App Router e metadata
├── src/components/          # folhas interativas do portal
├── src/lib/api.ts           # cliente HTTP tipado
└── README.md

service/app/routes/portal.py # endpoints do portal
service/migrations/005_customer_portal.sql
```

## Contratos adicionados

```text
POST /v1/portal/auth/register
POST /v1/portal/auth/login
GET  /v1/portal/me
GET  /v1/portal/dashboard
GET  /v1/portal/api-clients
POST /v1/portal/api-clients
POST /v1/portal/api-clients/{client_id}/rotate
POST /v1/portal/api-clients/{client_id}/revoke
GET  /v1/platform/accounts/{account_id}/dashboard
```

## Guia do cliente: preparação e operação

Esta seção descreve o procedimento que o cliente deve executar para conectar
seu sistema, preparar uma Estação e realizar operações de pesagem. A Conta é a
unidade de isolamento: credenciais, ordens, pesagens, Estações e eventos não
devem ser compartilhados com outra Conta.

### 1. Criar e confirmar o acesso ao Portal

1. Acesse a URL do Portal do Cliente.
2. Informe o nome da Conta, seu nome, e-mail e uma senha com no mínimo oito
   caracteres.
3. Confirme o e-mail recebido, quando o ambiente estiver configurado para
   confirmação de e-mail.
4. Entre no Portal usando o e-mail e a senha cadastrados.
5. Verifique em **Visão geral** se o nome da Conta e o usuário estão corretos.

O primeiro usuário é o administrador inicial da Conta. Ele é responsável por
proteger as credenciais e convidar ou administrar os demais usuários quando
essa função estiver habilitada no ambiente.

### 2. Criar a credencial do sistema consumidor

1. No Portal, abra **API Keys** e selecione **Nova API Key**.
2. Dê um nome identificável, por exemplo `AgroSaaS produção`.
3. Selecione somente os escopos necessários:
   - `clients:write` para registrar o sistema consumidor;
   - `orders:write` para criar Ordens de pesagem;
   - `orders:read` para consultar Ordens, quando disponível no ambiente;
   - `weighings:read` para consultar Pesagens;
   - `events:read` para consultar eventos;
   - `webhooks:read` e `webhooks:manage` para configurar o recebimento de
     eventos.
4. Gere a credencial e armazene o `client_id` e o `client_secret` em um
   secret manager do sistema consumidor.

O `client_secret` é exibido somente na criação ou rotação. Ele não deve ser
colocado em código frontend, commitado no repositório, enviado em query string
ou escrito em logs. Em caso de suspeita de vazamento, faça a rotação e atualize
o secret manager imediatamente.

### 3. Registrar o sistema dentro da Conta

O sistema consumidor deve registrar sua identificação uma única vez:

```http
POST /v1/clients
X-Tenant-ID: <tenant_uuid>
X-Balanca-Client-ID: <client_id>
X-Balanca-Client-Secret: <client_secret>
Content-Type: application/json
```

```json
{
  "sistema_cliente": "agrosaas",
  "tenant_cliente_id": "fazenda-123",
  "nome_exibicao": "AgroSaaS produção"
}
```

O cadastro é idempotente para o par `sistema_cliente` e `tenant_cliente_id`.
Se o sistema for renomeado, repita a chamada para atualizar o nome sem criar
um segundo sistema consumidor.

### 4. Preparar uma Estação de pesagem

No fluxo atualmente disponível, o cadastro inicial da Estação é feito no
Backoffice da Plataforma. O responsável deve fornecer ao administrador da
Plataforma o nome e um `external_id` único para cada ponto de pesagem. Depois:

1. O administrador cadastra a Estação e gera o código de ativação.
2. É criada uma credencial técnica com o escopo `stations:activate`.
3. Na máquina da Estação, o responsável configura a URL do Serviço, o
   `client_id`, o `client_secret` e o tenant autorizado.
4. Abre a aplicação da Estação e informa o código de ativação.
5. A API valida o código, vincula a Estação à Conta e devolve o `station_token`.
6. A aplicação guarda o token localmente e passa a usar esse token nas
   operações seguintes.

Depois da ativação, as operações da Estação usam seu próprio token; a API Key
técnica é necessária apenas para a ativação inicial. A Bridge deve ser
configurada para conectar o indicador físico à aplicação e o operador deve
confirmar o estado **Balança conectada** antes do turno.

> Evolução planejada: permitir que o administrador da própria Conta crie e
> gerencie Estações diretamente no Portal, sem depender do Backoffice para o
> cadastro cotidiano. O Backoffice continuará com bloqueio, auditoria e suporte
> global.

### 5. Criar a Ordem antes da pesagem

Quando o processo de negócio já for conhecido, o sistema consumidor cria uma
Ordem:

```http
POST /v1/orders
X-Tenant-ID: <tenant_uuid>
X-Balanca-Client-ID: <client_id>
X-Balanca-Client-Secret: <client_secret>
```

```json
{
  "client_system": "agrosaas",
  "client_tenant_id": "fazenda-123",
  "external_reference": "compra-2026-00042",
  "correlation_id": "nf-35260812345678901234550010000000421000000420",
  "subject_type": "VEICULO",
  "tipo_pesagem": "DUPLA",
  "contexto": {
    "veiculo": {"placa": "ABC1D23"},
    "produto": {"codigo": "SOJA"},
    "documento_fiscal": {"numero": "42"}
  }
}
```

`external_reference` e `correlation_id` devem ser estáveis. O sistema deve
persistir o `id` da Ordem devolvido pela API para localizar o processo e
relacioná-lo à pesagem.

### 6. Executar a operação na Estação

1. O operador entra na Estação com seu PIN.
2. A Estação sincroniza as Ordens pendentes.
3. O operador seleciona a Ordem e confere veículo, produto, origem, destino e
   etapa.
4. Aguarda a leitura do indicador ficar estável.
5. Confirma o peso aferido e a tara, quando aplicável.
6. A Estação registra a Pesagem vinculada à Ordem.
7. Com conexão disponível, a captura é enviada ao Serviço automaticamente.

Se não houver Ordem previamente sincronizada, a Estação pode registrar uma
Pesagem avulsa. O fato físico continua imutável e será reconciliado depois no
Backoffice ou no fluxo operacional apropriado.

### 7. Operar offline e sincronizar

Durante uma indisponibilidade de rede, a Estação mantém as Ordens e operadores
já sincronizados, grava as capturas no armazenamento local e coloca os itens em
fila. O operador não deve limpar os dados do navegador nem repetir manualmente
uma captura já confirmada.

Quando a conexão retornar, a Estação reenvia a fila usando o mesmo `local_id`.
Em caso de falha parcial, somente os itens com erro devem ser reenviados. A
idempotência evita que uma mesma Pesagem seja criada duas vezes.

### 8. Integrar as pesagens ao sistema do cliente

O sistema consumidor deve escolher uma ou ambas as formas abaixo:

**Webhook:** o administrador `OWNER` ou `ADMIN` deve abrir **Portal → Webhook**
e preencher:

1. **URL HTTPS do consumidor:** endereço público que receberá os eventos, por
   exemplo `https://erp.exemplo.com/integracoes/tara/webhook`.
2. **Segredo HMAC:** segredo compartilhado com no mínimo 32 caracteres. Na
   atualização, deixe o campo vazio para manter o segredo atual.
3. **Máximo de tentativas:** quantidade de novas tentativas após falha de
   entrega.
4. **Base do retry:** intervalo inicial, em segundos, usado pelo mecanismo de
   novas tentativas.

O Portal habilita atualmente o evento `balanca.pesagem.concluida.v1`. Depois de
salvar, use **Enviar teste** e confirme que o sistema consumidor recebeu o
evento `tara.webhook.test.v1`. Só depois faça uma pesagem de homologação.

O receptor deve validar a assinatura, persistir o `event_id`, responder
rapidamente e processar o negócio de forma assíncrona. Cada entrega contém:

```http
X-TARA-Event-Id: <event_id>
X-TARA-Account-Id: <account_id>
X-TARA-Timestamp: <unix_seconds>
X-TARA-Signature: sha256=<base64_digest>
```

A assinatura deve ser calculada com o corpo bruto recebido, sem reserializar o
JSON:

```text
message = POST + "\n" + request_path + "\n" + timestamp + "\n" + raw_body
digest = Base64(HMAC-SHA256(hmac_secret, message))
```

O consumidor deve rejeitar timestamp expirado, assinatura inválida ou Conta
incorreta e comparar o digest em tempo constante. Após validar, deve persistir o
evento antes de responder:

1. `2xx`: evento aceito e persistido;
2. `409`: duplicidade já processada, quando essa convenção for suportada;
3. `4xx`: erro permanente de contrato ou autenticação;
4. `5xx` ou timeout: falha temporária que permite retry pela TARA.

O sistema consumidor deve manter um índice único para `event_id` ou `capture_id`,
para que retries não reapliquem a mesma pesagem.

**API como mecanismo principal ou de recuperação:** use `GET /v1/orders?limit=100`
e `GET /v1/weighings?limit=100` com o mesmo conjunto de credenciais e o escopo
de leitura correspondente. Persista o `next_cursor` somente depois de processar
a página com sucesso e repita-o literalmente na próxima consulta. Não interprete
nem fabrique cursores. Se o webhook não for contratado ou estiver indisponível,
execute essa sincronização periodicamente; se o webhook for usado, consulte a
API após a notificação para obter os dados oficiais.

O Backoffice consulta suas Ordens pela rota separada `GET /v1/admin/orders`,
com autenticação humana e a permissão `backoffice:ordens:gerenciar`. Essa rota
não deve ser usada pelo sistema consumidor.

Em ambos os casos, o sistema consumidor deve tratar `event_id`, `capture_id` ou
`local_id` como chaves idempotentes, registrar o status recebido e preservar a
referência da Ordem. Uma Pesagem concluída não deve ser editada para corrigir
dados de negócio; divergências devem seguir o processo de reconciliação.

### 9. Acompanhar e tratar exceções no Portal

No Portal, o administrador da Conta deve usar **Visão geral** para acompanhar
ordens em aberto, taxa de conclusão, pesagens, reconciliações pendentes, API
Keys ativas, Estações e eventos pendentes. Em **Processos**, pode pesquisar por
referência, sistema ou tipo e filtrar as Ordens por status.

Quando uma Pesagem avulsa precisar de tratamento, o responsável deve preservar
o registro original e encaminhá-lo para reconciliação. Quando um evento estiver
pendente, deve verificar o endpoint, a assinatura e os logs do sistema
consumidor antes de solicitar um replay ao suporte da Plataforma.

## Banco

A migration `005_customer_portal.sql` cria `balanca.portal_users`, uma
identidade global de autenticação vinculada a `Conta` e `tenant_id`. A tabela
não compartilha entidades com o AgroSaaS.

Aplicação:

```bash
cd /opt/lampp/htdocs/tara/service
psql -h 192.168.0.3 -U borgus -W -d farms \
  -v ON_ERROR_STOP=1 -f migrations/005_customer_portal.sql
```

## Execução

```bash
cd /opt/lampp/htdocs/tara
pnpm portal:dev
```

A aplicação fica em `http://localhost:3005` e a API deve incluir essa origem
em `TARA_CORS_ORIGINS`.

## Validações

Passaram:

- compilação Python;
- importação da aplicação FastAPI;
- conferência dos endpoints no OpenAPI;
- `pnpm portal:typecheck`;
- `pnpm portal:lint`;
- `pnpm portal:build`;
- `git diff --check`.

O pytest não foi executado porque o ambiente `service/.venv` não possui o
módulo `pytest` instalado.

O typecheck/lint do Backoffice existente continua com falhas preexistentes em
`backoffice/src/app/page.tsx`, `data-table-example.tsx` e `sidebar.tsx`; os
erros não foram introduzidos pelo Portal.

## Próximas fases

- MFA;
- Sandbox;
- criação e gestão de Estações pelo administrador da própria Conta no Portal;
- gestão de operadores da Conta pelo Portal;
- pacote de instalação e atualização versionada da Estação;
- auditoria detalhada;
- rate limiting e proteção contra criação automatizada abusiva;
- filtros por período, Estação e tipo de operação nos processos;
- ações de reconciliação e acompanhamento de entrega de eventos no Portal.
