-- Fundação completa para um banco dedicado do serviço Balança.
-- É idempotente e também pode ser executada em um banco compartilhado vazio.

create schema if not exists balanca;

create table if not exists balanca.contas (
    id uuid primary key,
    tenant_id uuid not null unique,
    nome varchar(160) not null,
    status varchar(20) not null default 'ATIVA',
    created_at timestamp not null default now(),
    updated_at timestamp not null default now()
);

create table if not exists balanca.clientes (
    id uuid primary key,
    tenant_id uuid not null,
    conta_id uuid not null references balanca.contas(id) on delete cascade,
    sistema_cliente varchar(80) not null,
    tenant_cliente_id varchar(120) not null,
    nome_exibicao varchar(160) not null,
    status varchar(20) not null default 'ATIVO',
    created_at timestamp not null default now(),
    updated_at timestamp not null default now(),
    constraint uq_balanca_clientes_external_tenant
        unique (tenant_id, sistema_cliente, tenant_cliente_id)
);

create table if not exists balanca.eventos_outbox (
    id uuid primary key,
    tenant_id uuid not null,
    conta_id uuid not null references balanca.contas(id) on delete cascade,
    cliente_id uuid references balanca.clientes(id) on delete set null,
    idempotency_key varchar(180) not null,
    event_type varchar(120) not null,
    event_version varchar(20) not null,
    aggregate_type varchar(80) not null,
    aggregate_id uuid not null,
    correlation_id varchar(120) not null,
    payload jsonb not null,
    status varchar(20) not null default 'PENDENTE',
    attempts integer not null default 0,
    next_attempt_at timestamp,
    delivered_at timestamp,
    last_error text,
    created_at timestamp not null default now(),
    updated_at timestamp not null default now(),
    constraint uq_balanca_outbox_idempotency unique (tenant_id, idempotency_key)
);

create index if not exists ix_balanca_outbox_delivery
    on balanca.eventos_outbox(tenant_id, status, next_attempt_at);

do $$
declare
    table_name text;
begin
    foreach table_name in array array['contas','clientes','eventos_outbox'] loop
        execute format('alter table balanca.%I enable row level security', table_name);
        execute format('alter table balanca.%I force row level security', table_name);
        execute format('drop policy if exists %I_tenant_isolation on balanca.%I', table_name, table_name);
        execute format(
            'create policy %I_tenant_isolation on balanca.%I using (tenant_id::text = nullif(current_setting(''app.current_tenant_id'', true), '''')) with check (tenant_id::text = nullif(current_setting(''app.current_tenant_id'', true), ''''))',
            table_name, table_name, table_name
        );
    end loop;
end $$;
