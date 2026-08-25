# Plataforma Balança

Projeto independente de pesagem, estações offline, Bridge de hardware,
backoffice, contingência por pendrive e APIs para qualquer aplicação cliente.

```text
balanca-platform/
├── service/     API, banco, migrations e testes
├── backoffice/  aplicação web administrativa
├── station/     PWA offline-first da estação
├── bridge/      Bridge serial/TCP do indicador físico
├── contracts/   Contratos compartilhados da integração
└── docs/        Manuais operacionais
```

O AgroSaaS não importa código deste projeto. Ele usa somente as APIs da
Balança, por meio do adaptador localizado em
`services/api/integracoes/balanca/`.

## Início rápido

### Ordem recomendada para deixar o backoffice funcional

1. Configure o banco PostgreSQL `farms` e aplique as migrations no schema `balanca`.
2. Configure o `.env` da API, incluindo um segredo JWT forte e a origem do
   frontend.
3. Inicie a API da Balança.
4. Crie o primeiro administrador.
5. Instale e inicie o frontend do backoffice.
6. Acesse `http://localhost:3004` e faça login com o tenant informado no
   bootstrap.

Estação, Bridge e worker de outbox ficam para a etapa seguinte. O backoffice
administra clientes consumidores, credenciais de integração, estações,
operadores e acompanhamento do outbox.

### Serviço

```bash
cd /opt/lampp/htdocs/balanca-platform/service
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
cd /opt/lampp/htdocs/balanca-platform/service
BALANCA_PORT=8011 ./start_server.sh
```

Ao usar outra porta, aponte o backoffice para ela:

```bash
cd /opt/lampp/htdocs/balanca-platform
NEXT_PUBLIC_BALANCA_API_URL=http://localhost:8011 pnpm backoffice:dev
```

Depois de gerar o valor, substitua `BALANCA_JWT_SECRET_SECRET` no arquivo
`/opt/lampp/htdocs/balanca-platform/service/.env` pelo segredo gerado. Em
produção, o serviço não inicia com o valor padrão `change-me` nem com uma
chave curta.

Configure também a origem do frontend no `.env`:

```dotenv
BALANCA_CORS_ORIGINS=["http://localhost:3004","http://127.0.0.1:3004"]
```

O banco `farms` precisa existir antes de iniciar a API. As migrations criam e
gerenciam o schema `balanca` dentro desse banco; não crie um banco separado
chamado `balanca`. A URL da aplicação usa o formato SQLAlchemy
`postgresql+asyncpg://`, mas o cliente `psql` deve receber host, usuário e
banco separadamente.

Aplique as migrations:

```bash
cd /opt/lampp/htdocs/balanca-platform/service
psql -h 192.168.0.2 -U borgus -W -d farms -v ON_ERROR_STOP=1 -f migrations/000_platform_foundation.sql
psql -h 192.168.0.2 -U borgus -W -d farms -v ON_ERROR_STOP=1 -f migrations/001_service_tables.sql
psql -h 192.168.0.2 -U borgus -W -d farms -v ON_ERROR_STOP=1 -f migrations/002_security_identity.sql
psql -h 192.168.0.2 -U borgus -W -d farms -v ON_ERROR_STOP=1 -f migrations/003_contingency.sql
psql -h 192.168.0.2 -U borgus -W -d farms -v ON_ERROR_STOP=1 -f migrations/004_platform_admin.sql
```

Inicie a API:

```bash
cd /opt/lampp/htdocs/balanca-platform/service
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
cd /opt/lampp/htdocs/balanca-platform
pnpm install
cd /opt/lampp/htdocs/balanca-platform/station
pnpm run dev
```

### Backoffice

O backoffice é uma aplicação Next.js independente da estação. Para levantá-lo
localmente, mantenha a API da Balança em execução em um terminal:

```bash
cd /opt/lampp/htdocs/balanca-platform/service
./start_server.sh
```

Em outro terminal, instale as dependências e inicie o painel:

```bash
cd /opt/lampp/htdocs/balanca-platform
pnpm install
pnpm backoffice:dev
```

O painel estará disponível em `http://localhost:3004`. Por padrão, ele acessa
a API em `http://localhost:8010`. Para usar outra URL, defina a variável antes
de iniciar:

```bash
NEXT_PUBLIC_BALANCA_API_URL=http://localhost:8010 pnpm backoffice:dev
```

Ou crie `backoffice/.env.local`:

```dotenv
NEXT_PUBLIC_BALANCA_API_URL=http://localhost:8010
```

O primeiro administrador deve ser criado após aplicar as migrations:

```bash
cd /opt/lampp/htdocs/balanca-platform/service
export BALANCA_BOOTSTRAP_TENANT_ID=UUID_DO_TENANT_OPERACIONAL
./.venv/bin/python bootstrap_admin.py
```

O `BALANCA_BOOTSTRAP_TENANT_ID` é usado somente no bootstrap para vincular o
administrador às operações iniciais; ele não é informado na tela. Na tela de login, informe somente o login e a senha do administrador. O
backoffice autentica em `POST /v1/auth/login`, sem `Tenant ID` informado pelo
operador, e usa as permissões JWT/RBAC
para administrar clientes/API Keys, estações e operadores, além de consultar
ordens e eventos do outbox. O segredo de uma credencial é exibido somente na
criação ou rotação.

Para produção ou uma execução sem o servidor de desenvolvimento:

```bash
cd /opt/lampp/htdocs/balanca-platform
pnpm backoffice:build
pnpm --dir backoffice start
```

### Bridge

```bash
cd /opt/lampp/htdocs/balanca-platform/bridge
python3 -m venv .venv
./.venv/bin/pip install -r requirements.txt
cp config.yaml.example config.yaml
./.venv/bin/python -m balanca_bridge.main
```

## Contrato com consumidores

O consumidor recebe credenciais próprias (`client_id` e `client_secret`) e
acessa as APIs versionadas do serviço. O AgroSaaS permanece somente como um
consumidor, sem acesso direto ao banco e sem dependência de imports internos.

## Repositório independente

Este diretório possui seu próprio `.git` para permitir versionamento e release
independentes. Em produção, ele pode ser publicado como um repositório remoto
próprio, por exemplo `balanca-platform`.
# balanca
