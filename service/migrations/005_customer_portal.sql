-- Identidade e onboarding do Portal do Cliente da Plataforma Balança.

create table if not exists balanca.portal_users (
    id uuid primary key,
    usuario_id uuid unique references balanca.usuarios(id) on delete set null,
    conta_id uuid not null references balanca.contas(id) on delete cascade,
    tenant_id uuid not null,
    email varchar(255) not null unique,
    nome_exibicao varchar(160) not null,
    password_hash varchar(255) not null,
    role varchar(40) not null default 'OWNER',
    status varchar(20) not null default 'ATIVO',
    created_at timestamp not null default now(),
    last_login_at timestamp
);

grant usage on schema balanca to borgus;
grant select, insert, update, delete on balanca.portal_users to borgus;
