-- Pacotes assinados de contingência por pendrive.
alter table balanca.estacoes add column if not exists public_key jsonb;
alter table balanca.estacoes add column if not exists identity_fingerprint varchar(64);

create table if not exists balanca.contingencia_lotes (
    id uuid primary key,
    tenant_id uuid not null,
    station_id uuid not null references balanca.estacoes(id),
    package_id varchar(120) not null,
    sequence_number integer not null,
    schema_version varchar(30) not null,
    package_hash varchar(64) not null,
    identity_fingerprint varchar(64) not null,
    record_count integer not null,
    status varchar(20) not null,
    raw_package jsonb not null,
    error_message text,
    imported_at timestamp,
    created_at timestamp not null,
    constraint uq_balanca_contingencia_package unique (tenant_id, package_id),
    constraint uq_balanca_contingencia_sequence unique (tenant_id, station_id, sequence_number)
);

create table if not exists balanca.contingencia_itens (
    id uuid primary key,
    tenant_id uuid not null,
    lote_id uuid not null references balanca.contingencia_lotes(id) on delete cascade,
    local_id varchar(120) not null,
    status varchar(20) not null,
    pesagem_id uuid references balanca.pesagens(id),
    error_message text,
    payload jsonb not null,
    created_at timestamp not null,
    constraint uq_balanca_contingencia_local unique (tenant_id, local_id)
);

do $$
declare table_name text;
begin
    foreach table_name in array array['contingencia_lotes','contingencia_itens'] loop
        execute format('alter table balanca.%I enable row level security', table_name);
        execute format('alter table balanca.%I force row level security', table_name);
        execute format('drop policy if exists %I_tenant_isolation on balanca.%I', table_name, table_name);
        execute format(
            'create policy %I_tenant_isolation on balanca.%I using (tenant_id::text = nullif(current_setting(''app.current_tenant_id'', true), '''')) with check (tenant_id::text = nullif(current_setting(''app.current_tenant_id'', true), ''''))',
            table_name, table_name
        );
    end loop;
end $$;
