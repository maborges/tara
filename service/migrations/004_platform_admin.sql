-- Identidade global de entrada do Backoffice da Plataforma Balança.
-- O vínculo operacional mantém compatibilidade temporária com o RBAC tenant-scoped.

create table if not exists tara.administradores_plataforma (
    id uuid primary key,
    usuario_id uuid not null unique references tara.usuarios(id) on delete cascade,
    tenant_id uuid not null,
    login varchar(120) not null unique,
    nome_exibicao varchar(160) not null,
    password_hash varchar(255) not null,
    status varchar(20) not null default 'ATIVO',
    created_at timestamp not null default now(),
    last_login_at timestamp
);

-- A tabela é global por desenho: é consultada antes de existir contexto de tenant.
-- Em instalações compartilhadas, o usuário da aplicação pode não ser o dono
-- da tabela criada pelo usuário administrativo que aplicou a migration.
grant usage on schema tara to borgus;
grant select, insert, update, delete on tara.administradores_plataforma to borgus;
