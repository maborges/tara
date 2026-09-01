# Serviço independente da Plataforma Balança

Este diretório é o limite de deploy do serviço Balança. Ele possui API,
modelos, migração das tabelas próprias, backoffice com JWT/RBAC, credenciais
por consumidor e token separado para estações, além do outbox Observer.

O serviço não importa módulos de domínio do AgroSaaS nem acessa tabelas do
cliente. A única fronteira compartilhada é o contrato de integração e o schema
`balanca` dentro do banco PostgreSQL `farms`.

Manual operacional: [docs/MANUAL_OPERACAO.md](docs/MANUAL_OPERACAO.md).

## Execução

Comandos:

    cd tara/service
    python3 -m venv .venv
    ./.venv/bin/pip install -r requirements.txt
    cp .env.example .env
    psql --set=ON_ERROR_STOP=1 "$TARA_DATABASE_URL" -f migrations/000_platform_foundation.sql
    psql --set=ON_ERROR_STOP=1 "$TARA_DATABASE_URL" -f migrations/001_service_tables.sql
    psql --set=ON_ERROR_STOP=1 "$TARA_DATABASE_URL" -f migrations/002_security_identity.sql
    psql --set=ON_ERROR_STOP=1 "$TARA_DATABASE_URL" -f migrations/003_contingency.sql
    psql --set=ON_ERROR_STOP=1 "$TARA_DATABASE_URL" -f migrations/004_platform_admin.sql
    psql --set=ON_ERROR_STOP=1 "$TARA_DATABASE_URL" -f migrations/005_customer_portal.sql
    psql --set=ON_ERROR_STOP=1 "$TARA_DATABASE_URL" -f migrations/006_portal_email_security.sql
    psql --set=ON_ERROR_STOP=1 "$TARA_DATABASE_URL" -f migrations/007_platform_email_settings.sql
    psql --set=ON_ERROR_STOP=1 "$TARA_DATABASE_URL" -f migrations/008_api_client_secret_rotation.sql
    psql --set=ON_ERROR_STOP=1 "$TARA_DATABASE_URL" -f migrations/009_rename_balanca_schema.sql
    psql --set=ON_ERROR_STOP=1 "$TARA_DATABASE_URL" -f migrations/010_station_account.sql
    psql --set=ON_ERROR_STOP=1 "$TARA_DATABASE_URL" -f migrations/011_pesagem_avulsa.sql
    psql --set=ON_ERROR_STOP=1 "$TARA_DATABASE_URL" -f migrations/012_platform_admin_rls.sql
    psql --set=ON_ERROR_STOP=1 "$TARA_DATABASE_URL" -f migrations/013_webhook_destinations.sql
    psql --set=ON_ERROR_STOP=1 "$TARA_DATABASE_URL" -f migrations/014_outbox_replay_audit.sql
    psql --set=ON_ERROR_STOP=1 "$TARA_DATABASE_URL" -f migrations/015_webhook_retry_policy.sql
    psql --set=ON_ERROR_STOP=1 "$TARA_DATABASE_URL" -f migrations/016_platform_dashboard_rls.sql
    psql --set=ON_ERROR_STOP=1 "$TARA_DATABASE_URL" -f migrations/017_pesagem_station.sql
    psql --set=ON_ERROR_STOP=1 "$TARA_DATABASE_URL" -f migrations/018_table_comments.sql
    ./start_server.sh

Endpoints:

- POST /v1/auth/login;
- POST /v1/portal/auth/register e /auth/login;
- GET /v1/portal/me;
- GET/POST /v1/portal/api-clients e rotação/revogação;
- POST /v1/admin/api-clients;
- GET /v1/admin/api-clients;
- POST /v1/admin/api-clients/{client_id}/rotate e /revoke;
- GET /healthz e GET /readyz;
- POST /v1/clients e POST /v1/orders;
- POST /v1/stations e POST /v1/stations/activate;
- POST /v1/operators;
- POST /v1/stations/pesagens;
- POST /v1/contingency/import;
- GET /v1/events;
- GET /v1/admin/weighings e POST /v1/admin/weighings/{id}/reconcile.
- POST /v1/admin/events/{id}/replay.
- GET /v1/admin/events/{id}/replays.
- GET/PUT /v1/portal/users e /v1/portal/users/{id}.

O worker independente pode ser executado com python run_worker.py; para
produção, use balanca-outbox.service.example. Ele entrega por HTTP ou arquivo
JSONL, com retry e idempotência.

## Primeiro acesso do backoffice

Depois de aplicar as migrations, crie o primeiro administrador fora da API:

    export TARA_BOOTSTRAP_TENANT_ID=UUID_DO_TENANT_OPERACIONAL
    ./.venv/bin/python bootstrap_admin.py

O usuário acessa POST /v1/auth/login somente com login e senha. A resposta
contém um JWT do backoffice; as rotas administrativas exigem esse token e uma
permissão específica. O header X-Tenant-ID continua aceito temporariamente
apenas para compatibilidade com clientes legados.

Aplicações consumidoras não usam o login humano. O administrador cria uma
credencial em POST /v1/admin/api-clients. O segredo é exibido uma única vez e
deve ser armazenado pelo consumidor. As chamadas usam
X-Balanca-Client-ID, X-Balanca-Client-Secret e escopos, sem compartilhar uma
chave global. Os escopos disponíveis são clients:write, orders:write,
events:read e stations:activate. A credencial pode ser rotacionada em
POST /v1/admin/api-clients/{client_id}/rotate e revogada em
POST /v1/admin/api-clients/{client_id}/revoke; o segredo nunca é exibido na
revogação.

Chamadas administrativas usam Authorization: Bearer, X-Tenant-ID e a
permissão correspondente. A estação usa Authorization: Bearer e X-Tenant-ID.
Os IDs de tenant do sistema
consumidor permanecem textuais dentro do contrato.

## Contingência por mídia física

O serviço Balança define o contrato `balanca.contingency.v1`. Qualquer estação
ou aplicação cliente pode produzir esse pacote; o PWA apenas oferece o botão
"Exportar contingência" como uma implementação de produtor. O pacote JSON
possui `package_id`, sequência por estação, tenant, estação, registros locais,
chave pública e assinatura ECDSA P-256.

O backoffice importa o arquivo pela API autenticada:

    POST /v1/contingency/import
    Authorization: Bearer <JWT_DO_BACKOFFICE>
    X-Tenant-ID: <TENANT>

Também é possível usar o utilitário operacional:

    ./.venv/bin/python import_contingency.py /media/pendrive/pacote.balanca.json \
      --tenant UUID_DO_TENANT --token JWT_DO_BACKOFFICE

O serviço valida assinatura, tenant, estação, identidade, sequência e
idempotência. O lote bruto e o resultado de cada item ficam registrados em
`tara.contingencia_lotes` e `tara.contingencia_itens`. Os estados são
`IMPORTADO`, `PARCIAL` ou `REJEITADO`; repetir o mesmo pacote não duplica dados.
Pesagens sem ordem prévia geram uma ordem sombra de contingência para posterior
conciliação com o sistema consumidor.

## Operação offline

A estação PWA é distribuída separadamente em `../station` neste projeto.
Durante a indisponibilidade da rede, ela grava no IndexedDB e sincroniza com
POST /v1/stations/pesagens quando a conexão retorna. O serviço não exige
conectividade para a captura local.

## Compatibilidade

O router legado em services/api/balanca continua disponível durante a
migração. O AgroSaaS pode mudar a URL do conector para este serviço por
configuração, sem acesso direto ao banco do cliente.
