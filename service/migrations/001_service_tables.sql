-- Tabelas pertencentes ao serviço independente Balança.
-- Executar depois da fundação tara.contas/clientes/eventos_outbox.

create schema if not exists tara;

create table if not exists tara.estacoes (
    id uuid primary key,
    tenant_id uuid not null,
    external_id varchar(120) not null,
    nome varchar(160) not null,
    activation_code varchar(12),
    token_hash varchar(64),
    status varchar(20) not null,
    last_seen_at timestamp,
    created_at timestamp not null,
    constraint uq_TARA_estacoes_external unique (tenant_id, external_id)
);

create table if not exists tara.operadores (
    id uuid primary key,
    tenant_id uuid not null,
    codigo varchar(40) not null,
    nome_exibicao varchar(150) not null,
    pessoa_ref varchar(120),
    pin_hash varchar(64),
    status varchar(20) not null,
    created_at timestamp not null,
    constraint uq_TARA_operadores_codigo unique (tenant_id, codigo)
);

create table if not exists tara.ordens (
    id uuid primary key,
    tenant_id uuid not null,
    cliente_id uuid not null references tara.clientes(id),
    sistema_cliente varchar(80) not null,
    tenant_cliente_id varchar(120) not null,
    referencia_externa varchar(180) not null,
    correlation_id varchar(120) not null,
    subject_type varchar(20) not null,
    tipo_pesagem varchar(30) not null,
    contexto jsonb not null,
    status varchar(20) not null,
    peso_liquido_kg numeric(12,3),
    created_at timestamp not null,
    concluida_em timestamp,
    constraint uq_TARA_ordens_external unique (tenant_id, sistema_cliente, referencia_externa)
);

create index if not exists ix_TARA_ordens_status
    on tara.ordens(tenant_id, status);

create table if not exists tara.pesagens (
    id uuid primary key,
    tenant_id uuid not null,
    ordem_id uuid not null references tara.ordens(id) on delete cascade,
    local_id varchar(120) not null,
    etapa varchar(30) not null,
    peso_informado_kg numeric(12,3),
    peso_aferido_kg numeric(12,3) not null,
    peso_tara_kg numeric(12,3),
    captured_via varchar(20) not null,
    operador_id uuid references tara.operadores(id),
    leitura_bruta jsonb,
    captured_at timestamp not null,
    constraint uq_TARA_pesagens_local unique (tenant_id, local_id),
    constraint uq_TARA_pesagens_ordem_etapa unique (ordem_id, etapa)
);

do $$
declare
    table_name text;
begin
    foreach table_name in array array['estacoes','operadores','ordens','pesagens'] loop
        execute format('alter table tara.%I enable row level security', table_name);
        execute format('alter table tara.%I force row level security', table_name);
        execute format('drop policy if exists %I_tenant_isolation on tara.%I', table_name, table_name);
        execute format(
            'create policy %I_tenant_isolation on tara.%I using (tenant_id::text = nullif(current_setting(''app.current_tenant_id'', true), '''')) with check (tenant_id::text = nullif(current_setting(''app.current_tenant_id'', true), ''''))',
            table_name, table_name, table_name
        );
    end loop;
end $$;
