# BALANCA-PORTAL-01 — Portal do Cliente

**Status:** MVP implementado  
**Escopo:** autoatendimento de conta e API Keys  
**Independência:** não importa código, model, service ou tabela do AgroSaaS

## Resultado

Foi criada uma aplicação própria em `portal/`, separada do Backoffice Global.
O cliente pode criar sua conta, autenticar-se e administrar as credenciais
técnicas da própria conta.

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
GET  /v1/portal/api-clients
POST /v1/portal/api-clients
POST /v1/portal/api-clients/{client_id}/rotate
POST /v1/portal/api-clients/{client_id}/revoke
```

## Banco

A migration `005_customer_portal.sql` cria `balanca.portal_users`, uma
identidade global de autenticação vinculada a `Conta` e `tenant_id`. A tabela
não compartilha entidades com o AgroSaaS.

Aplicação:

```bash
cd /opt/lampp/htdocs/balanca-platform/service
psql -h 192.168.0.2 -U borgus -W -d farms \
  -v ON_ERROR_STOP=1 -f migrations/005_customer_portal.sql
```

## Execução

```bash
cd /opt/lampp/htdocs/balanca-platform
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

- confirmação de e-mail e recuperação de senha;
- convite e gestão de usuários da conta;
- MFA;
- Sandbox;
- webhooks e assinatura de eventos;
- gestão de estações e operadores;
- auditoria detalhada;
- rate limiting e proteção contra criação automatizada abusiva.

