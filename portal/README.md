# Portal do Cliente Balança

Aplicação independente para o cliente consumidor administrar a própria conta
na Plataforma Balança.

## MVP disponível

- cadastro da conta e do primeiro administrador;
- login próprio do cliente;
- visão isolada da conta;
- criação de API Keys;
- rotação e revogação de credenciais;
- exibição única do `client_secret`;
- UX responsiva com estados de carregamento e vazio.

## Execução

Com o serviço Balança em `http://localhost:8010`:

```bash
cd /opt/lampp/htdocs/tara
pnpm portal:dev
```

Acesse `http://localhost:3005`.

Para outra URL da API:

```bash
NEXT_PUBLIC_TARA_API_URL=http://localhost:8011 pnpm portal:dev
```

## Limites do MVP

Webhooks, Sandbox, convite de usuários, estações, operadores, MFA e auditoria
detalhada ainda são extensões planejadas. O portal não acessa o banco e não
compartilha código de domínio com o AgroSaaS.
