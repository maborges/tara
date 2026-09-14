alter table tara.estacoes add column if not exists recovery_secret_hash varchar(64);
alter table tara.estacoes add column if not exists recovery_secret_version integer not null default 1;
alter table tara.operadores add column if not exists identificador_externo varchar(120);
create unique index if not exists uq_TARA_operadores_external on tara.operadores(tenant_id, identificador_externo) where identificador_externo is not null;
create table if not exists tara.estacao_operadores (
    estacao_id uuid not null references tara.estacoes(id) on delete cascade,
    operador_id uuid not null references tara.operadores(id) on delete cascade,
    tenant_id uuid not null,
    status varchar(20) not null default 'ATIVO',
    created_at timestamp not null default now(),
    primary key (estacao_id, operador_id),
    constraint uq_TARA_estacao_operador unique (estacao_id, operador_id)
);
create index if not exists ix_TARA_estacao_operadores_tenant on tara.estacao_operadores(tenant_id, estacao_id, status);
alter table tara.estacao_operadores enable row level security;
alter table tara.estacao_operadores force row level security;
drop policy if exists estacao_operadores_tenant_isolation on tara.estacao_operadores;
create policy estacao_operadores_tenant_isolation on tara.estacao_operadores
using (tenant_id::text = nullif(current_setting('app.current_tenant_id', true), ''))
with check (tenant_id::text = nullif(current_setting('app.current_tenant_id', true), ''));
