-- Identidade própria do backoffice, RBAC e credenciais dos consumidores.

create table if not exists tara.usuarios (
    id uuid primary key,
    tenant_id uuid not null,
    login varchar(120) not null,
    nome_exibicao varchar(160) not null,
    password_hash varchar(255) not null,
    status varchar(20) not null default 'ATIVO',
    created_at timestamp not null,
    last_login_at timestamp,
    constraint uq_TARA_usuarios_login unique (tenant_id, login)
);

create table if not exists tara.papeis (
    id uuid primary key,
    tenant_id uuid not null,
    codigo varchar(80) not null,
    nome varchar(160) not null,
    status varchar(20) not null default 'ATIVO',
    constraint uq_TARA_papeis_codigo unique (tenant_id, codigo)
);

create table if not exists tara.permissoes (
    id uuid primary key,
    tenant_id uuid not null,
    codigo varchar(120) not null,
    descricao varchar(240) not null,
    constraint uq_TARA_permissoes_codigo unique (tenant_id, codigo)
);

create table if not exists tara.usuario_papeis (
    usuario_id uuid not null references tara.usuarios(id) on delete cascade,
    papel_id uuid not null references tara.papeis(id) on delete cascade,
    primary key (usuario_id, papel_id)
);

create table if not exists tara.papel_permissoes (
    papel_id uuid not null references tara.papeis(id) on delete cascade,
    permissao_id uuid not null references tara.permissoes(id) on delete cascade,
    primary key (papel_id, permissao_id)
);

create table if not exists tara.api_clients (
    id uuid primary key,
    tenant_id uuid not null,
    client_id varchar(120) not null unique,
    nome varchar(160) not null,
    secret_hash varchar(64) not null,
    scopes jsonb not null,
    status varchar(20) not null default 'ATIVO',
    expires_at timestamp,
    created_at timestamp not null,
    last_used_at timestamp
);

do $$
declare table_name text;
begin
    foreach table_name in array array['usuarios','papeis','permissoes','api_clients'] loop
        execute format('alter table tara.%I enable row level security', table_name);
        execute format('alter table tara.%I force row level security', table_name);
        execute format('drop policy if exists %I_tenant_isolation on tara.%I', table_name, table_name);
        execute format(
            'create policy %I_tenant_isolation on tara.%I using (tenant_id::text = nullif(current_setting(''app.current_tenant_id'', true), '''')) with check (tenant_id::text = nullif(current_setting(''app.current_tenant_id'', true), ''''))',
            table_name, table_name, table_name
        );
    end loop;
end $$;
