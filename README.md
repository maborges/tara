# Plataforma Balança

Projeto independente de pesagem, estações offline, Bridge de hardware,
backoffice, contingência por pendrive e APIs para qualquer aplicação cliente.

```text
tara/
├── service/     API, banco, migrations e testes
├── backoffice/  aplicação web administrativa
├── portal/      aplicação web de autoatendimento do cliente
├── station/     PWA offline-first da estação
├── bridge/      Bridge serial/TCP do indicador físico
├── contracts/   Contratos compartilhados da integração
└── docs/        Manuais operacionais
```

O AgroSaaS não importa código deste projeto. Ele usa somente as APIs da
Balança, por meio do adaptador localizado em
`services/api/integracoes/balanca/`.

Documentação técnica para aplicações cliente:
[docs/INTEGRACAO_CLIENTE_TECNICA.md](docs/INTEGRACAO_CLIENTE_TECNICA.md).

## Comandos por módulo

O Backoffice Global e o Portal do Cliente são aplicações distintas. O
Backoffice administra a plataforma e configura o SMTP; o Portal é utilizado
pelas contas consumidoras para gerar e administrar suas próprias API Keys.

### Serviço da API (usado pelo Backoffice e pelo Portal)

O banco correto é `farms`; `tara` é o schema:

```bash
cd /opt/lampp/htdocs/tara/service
psql -h 192.168.0.2 -U borgus -W -d farms -v ON_ERROR_STOP=1 -f migrations/000_platform_foundation.sql
psql -h 192.168.0.2 -U borgus -W -d farms -v ON_ERROR_STOP=1 -f migrations/001_service_tables.sql
psql -h 192.168.0.2 -U borgus -W -d farms -v ON_ERROR_STOP=1 -f migrations/002_security_identity.sql
psql -h 192.168.0.2 -U borgus -W -d farms -v ON_ERROR_STOP=1 -f migrations/003_contingency.sql
psql -h 192.168.0.2 -U borgus -W -d farms -v ON_ERROR_STOP=1 -f migrations/004_platform_admin.sql
psql -h 192.168.0.2 -U borgus -W -d farms -v ON_ERROR_STOP=1 -f migrations/005_customer_portal.sql
psql -h 192.168.0.2 -U borgus -W -d farms -v ON_ERROR_STOP=1 -f migrations/006_portal_email_security.sql
psql -h 192.168.0.2 -U borgus -W -d farms -v ON_ERROR_STOP=1 -f migrations/007_platform_email_settings.sql
psql -h 192.168.0.2 -U borgus -W -d farms -v ON_ERROR_STOP=1 -f migrations/008_api_client_secret_rotation.sql
psql -h 192.168.0.2 -U borgus -W -d farms -v ON_ERROR_STOP=1 -f migrations/009_rename_balanca_schema.sql
psql -h 192.168.0.2 -U borgus -W -d farms -v ON_ERROR_STOP=1 -f migrations/010_station_account.sql
psql -h 192.168.0.2 -U borgus -W -d farms -v ON_ERROR_STOP=1 -f migrations/011_pesagem_avulsa.sql
psql -h 192.168.0.2 -U borgus -W -d farms -v ON_ERROR_STOP=1 -f migrations/012_platform_admin_rls.sql
psql -h 192.168.0.2 -U borgus -W -d farms -v ON_ERROR_STOP=1 -f migrations/013_webhook_destinations.sql
psql -h 192.168.0.2 -U borgus -W -d farms -v ON_ERROR_STOP=1 -f migrations/014_outbox_replay_audit.sql
psql -h 192.168.0.2 -U borgus -W -d farms -v ON_ERROR_STOP=1 -f migrations/015_webhook_retry_policy.sql
psql -h 192.168.0.2 -U borgus -W -d farms -v ON_ERROR_STOP=1 -f migrations/016_platform_dashboard_rls.sql
psql -h 192.168.0.2 -U borgus -W -d farms -v ON_ERROR_STOP=1 -f migrations/017_pesagem_station.sql
```

Configure `service/.env`, principalmente `TARA_DATABASE_URL`,
`TARA_JWT_SECRET_SECRET`, `TARA_CORS_ORIGINS` e `TARA_PUBLIC_URL`.
As credenciais SMTP são configuradas no Backoffice e persistidas no banco; não
devem ser colocadas no `.env`.

Terminal 1 — API:

```bash
cd /opt/lampp/htdocs/tara/service
./start_server.sh
```

### Como derrubar o serviço da Balança

Se a API estiver ocupando o terminal atual, pressione `Ctrl+C`.

Se estiver rodando em segundo plano, localize o processo que escuta a porta
`8010`:

```bash
lsof -nP -iTCP:8010 -sTCP:LISTEN
```

Encerre-o normalmente usando o PID retornado:

```bash
kill -TERM PID
```

Verifique se ainda está ativo:

```bash
ps -p PID
lsof -nP -iTCP:8010 -sTCP:LISTEN
```

Se o processo permanecer ativo, force o encerramento somente após confirmar o
PID correto:

```bash
kill -KILL PID
```

Não encerre o processo da porta `8000`: ele pertence ao AgroSaaS. Se o serviço
da Balança voltar a aparecer automaticamente, verifique se existe outro
terminal, supervisor ou script reiniciando `uvicorn`.

Valide:

```bash
curl http://127.0.0.1:8010/healthz
curl http://127.0.0.1:8010/readyz
```

### Backoffice Global — frontend e serviço

*** Crie o primeiro administrador apenas uma vez: ***

```bash
cd /opt/lampp/htdocs/tara/service
export TARA_BOOTSTRAP_TENANT_ID=$(uuidgen)
./.venv/bin/python bootstrap_admin.py
```

O `TARA_BOOTSTRAP_TENANT_ID` é um identificador técnico inicial; ele não é
informado na tela de login.

Terminal 2 — Backoffice:

```bash
cd /opt/lampp/htdocs/tara
pnpm install
pnpm backoffice:dev
```

Acesse [http://localhost:3004](http://localhost:3004) e entre somente com o
login e a senha do administrador da plataforma. Depois acesse:

```text
Configurações → Configuração de e-mail
```

Informe o SMTP, salve a configuração no banco e envie um e-mail de teste.

### Portal do Cliente — frontend e serviço

Se a API ainda não estiver em execução, inicie-a em um terminal:

```bash
cd /opt/lampp/htdocs/tara/service
./start_server.sh
```

Em outro terminal, inicie o Portal:

```bash
cd /opt/lampp/htdocs/tara
pnpm portal:dev
```

Acesse [http://localhost:3005](http://localhost:3005). O cliente poderá criar
sua conta, confirmar o e-mail recebido, entrar no Portal e gerar suas API Keys
sem depender do administrador global.

O Portal também disponibiliza:

```text
/forgot-password
/verify-email?token=TOKEN_RECEBIDO_POR_EMAIL
/reset-password?token=TOKEN_RECEBIDO_POR_EMAIL
```

### Reset ou rotação de API Key

O Client Secret não pode ser reenviado: por segurança, a Plataforma Balança
não armazena o segredo em texto recuperável. Se ele for perdido, use a ação
`Resetar/rotacionar segredo` no Portal do Cliente ou no Backoffice Global.

Antes de confirmar a operação, atualize o sistema consumidor para aceitar a
troca. A rotação:

1. coloca o Client Secret anterior em período de transição por 24 horas;
2. mantém o mesmo `client_id`, permissões e validade da credencial;
3. gera um novo Client Secret;
4. exibe o novo segredo somente uma vez;
5. exige que o cliente atualize sua configuração antes do fim da transição;
6. revoga o segredo anterior ao final da janela de transição.

Durante a transição, o sistema consumidor ficará sem autenticar. Se houver
suspeita de comprometimento e a integração não puder continuar, use `Revogar`,
que desativa completamente a API Key. Para voltar a integrar depois, será
necessário criar uma nova credencial.

## Início rápido

### Ordem recomendada para deixar o backoffice funcional

1. Configure o banco PostgreSQL `farms` e aplique as migrations no schema `tara`.
2. Configure o `.env` da API, incluindo um segredo JWT forte e a origem do
   frontend.
3. Inicie a API da Balança.
4. Crie o primeiro administrador.
5. Instale e inicie o frontend do backoffice.
6. Acesse `http://localhost:3004` e faça login com o administrador global.

Estação, Bridge e worker de outbox ficam para a etapa seguinte. O backoffice
administra clientes consumidores, credenciais de integração, estações,
operadores e acompanhamento do outbox.

### Serviço

```bash
cd /opt/lampp/htdocs/tara/service
python3 -m venv .venv
./.venv/bin/pip install -r requirements.txt
cp .env.example .env
# Gere um segredo forte para o ambiente de produção:
openssl rand -hex 32
```

O `start_server.sh` usa automaticamente `service/.venv/bin/python`. Não é
necessário instalar `uvicorn` no Python global do sistema.

Se aparecer `address already in use`, já existe um processo ocupando a porta
`8010`. Nesse caso, reutilize a instância existente ou inicie esta API em outra
porta:

```bash
cd /opt/lampp/htdocs/tara/service
TARA_PORT=8011 ./start_server.sh
```

Ao usar outra porta, aponte o backoffice para ela:

```bash
cd /opt/lampp/htdocs/tara
NEXT_PUBLIC_TARA_API_URL=http://localhost:8011 pnpm backoffice:dev
```

Depois de gerar o valor, substitua `TARA_JWT_SECRET_SECRET` no arquivo
`/opt/lampp/htdocs/tara/service/.env` pelo segredo gerado. Em
produção, o serviço não inicia com o valor padrão `change-me` nem com uma
chave curta.

Configure também a origem do frontend no `.env`:

```dotenv
TARA_CORS_ORIGINS=["http://localhost:3004","http://127.0.0.1:3004"]
```

O banco `farms` precisa existir antes de iniciar a API. As migrations criam e
gerenciam o schema `tara` dentro desse banco; não crie um banco separado
chamado `balanca`. A URL da aplicação usa o formato SQLAlchemy
`postgresql+asyncpg://`, mas o cliente `psql` deve receber host, usuário e
banco separadamente.

Aplique as migrations:

```bash
cd /opt/lampp/htdocs/tara/service
psql -h 192.168.0.2 -U borgus -W -d farms -v ON_ERROR_STOP=1 -f migrations/000_platform_foundation.sql
psql -h 192.168.0.2 -U borgus -W -d farms -v ON_ERROR_STOP=1 -f migrations/001_service_tables.sql
psql -h 192.168.0.2 -U borgus -W -d farms -v ON_ERROR_STOP=1 -f migrations/002_security_identity.sql
psql -h 192.168.0.2 -U borgus -W -d farms -v ON_ERROR_STOP=1 -f migrations/003_contingency.sql
psql -h 192.168.0.2 -U borgus -W -d farms -v ON_ERROR_STOP=1 -f migrations/004_platform_admin.sql
psql -h 192.168.0.2 -U borgus -W -d farms -v ON_ERROR_STOP=1 -f migrations/005_customer_portal.sql
psql -h 192.168.0.2 -U borgus -W -d farms -v ON_ERROR_STOP=1 -f migrations/006_portal_email_security.sql
psql -h 192.168.0.2 -U borgus -W -d farms -v ON_ERROR_STOP=1 -f migrations/007_platform_email_settings.sql
psql -h 192.168.0.2 -U borgus -W -d farms -v ON_ERROR_STOP=1 -f migrations/008_api_client_secret_rotation.sql
psql -h 192.168.0.2 -U borgus -W -d farms -v ON_ERROR_STOP=1 -f migrations/009_rename_balanca_schema.sql
psql -h 192.168.0.2 -U borgus -W -d farms -v ON_ERROR_STOP=1 -f migrations/010_station_account.sql
psql -h 192.168.0.2 -U borgus -W -d farms -v ON_ERROR_STOP=1 -f migrations/011_pesagem_avulsa.sql
psql -h 192.168.0.2 -U borgus -W -d farms -v ON_ERROR_STOP=1 -f migrations/012_platform_admin_rls.sql
psql -h 192.168.0.2 -U borgus -W -d farms -v ON_ERROR_STOP=1 -f migrations/013_webhook_destinations.sql
psql -h 192.168.0.2 -U borgus -W -d farms -v ON_ERROR_STOP=1 -f migrations/014_outbox_replay_audit.sql
psql -h 192.168.0.2 -U borgus -W -d farms -v ON_ERROR_STOP=1 -f migrations/015_webhook_retry_policy.sql
psql -h 192.168.0.2 -U borgus -W -d farms -v ON_ERROR_STOP=1 -f migrations/016_platform_dashboard_rls.sql
psql -h 192.168.0.2 -U borgus -W -d farms -v ON_ERROR_STOP=1 -f migrations/017_pesagem_station.sql
```

Inicie a API:

```bash
cd /opt/lampp/htdocs/tara/service
./start_server.sh
```

Em outro terminal, valide a API:

```bash
curl http://127.0.0.1:8010/healthz
curl http://127.0.0.1:8010/readyz
```

Consulte [service/docs/MANUAL_OPERACAO.md](service/docs/MANUAL_OPERACAO.md).

### Estação

```bash
cd /opt/lampp/htdocs/tara
pnpm install
cd /opt/lampp/htdocs/tara/station
pnpm run dev
```

### Backoffice

O backoffice é uma aplicação Next.js independente da estação. Para levantá-lo
localmente, mantenha a API da Balança em execução em um terminal:

```bash
cd /opt/lampp/htdocs/tara/service
./start_server.sh
```

Em outro terminal, instale as dependências e inicie o painel:

```bash
cd /opt/lampp/htdocs/tara
pnpm install
pnpm backoffice:dev
```

O painel estará disponível em `http://localhost:3004`. Por padrão, ele acessa
a API em `http://localhost:8010`. Para usar outra URL, defina a variável antes
de iniciar:

```bash
NEXT_PUBLIC_TARA_API_URL=http://localhost:8010 pnpm backoffice:dev
```

### Portal do Cliente

O Portal do Cliente é separado do Backoffice Global. Ele permite criar uma
conta, autenticar o administrador do cliente e administrar API Keys da própria
conta.

```bash
cd /opt/lampp/htdocs/tara
pnpm portal:dev
```

Acesse `http://localhost:3005`. A API deve permitir essa origem em
`TARA_CORS_ORIGINS`.

Ou crie `portal/.env.local`:

```dotenv
NEXT_PUBLIC_TARA_API_URL=http://localhost:8010
```

O primeiro administrador deve ser criado após aplicar as migrations:

```bash
cd /opt/lampp/htdocs/tara/service
export TARA_BOOTSTRAP_TENANT_ID=UUID_DO_TENANT_OPERACIONAL
./.venv/bin/python bootstrap_admin.py
```

O `TARA_BOOTSTRAP_TENANT_ID` é usado somente no bootstrap para vincular o
administrador às operações iniciais; ele não é informado na tela. Na tela de login, informe somente o login e a senha do administrador. O
backoffice autentica em `POST /v1/auth/login`, sem `Tenant ID` informado pelo
operador, e usa as permissões JWT/RBAC
para administrar clientes/API Keys, estações e operadores, além de consultar
ordens e eventos do outbox. O segredo de uma credencial é exibido somente na
criação ou rotação.

Para produção ou uma execução sem o servidor de desenvolvimento:

```bash
cd /opt/lampp/htdocs/tara
pnpm backoffice:build
pnpm --dir backoffice start
```

### Bridge

```bash
cd /opt/lampp/htdocs/tara/bridge
python3 -m venv .venv
./.venv/bin/pip install -r requirements.txt
cp config.yaml.example config.yaml
./.venv/bin/python -m TARA_bridge.main
```

## Contrato com consumidores

O consumidor recebe credenciais próprias (`client_id` e `client_secret`) e
acessa as APIs versionadas do serviço. O AgroSaaS permanece somente como um
consumidor, sem acesso direto ao banco e sem dependência de imports internos.

## Repositório independente

Este diretório possui seu próprio `.git` para permitir versionamento e release
independentes. Em produção, ele pode ser publicado como um repositório remoto
próprio, por exemplo `tara`.
# balanca
