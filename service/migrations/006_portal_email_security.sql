-- Confirmação de e-mail e recuperação de senha do Portal do Cliente.

alter table tara.portal_users
    add column if not exists email_verified_at timestamp;

update tara.portal_users
set email_verified_at = coalesce(email_verified_at, created_at)
where email_verified_at is null;

create table if not exists tara.portal_tokens (
    id uuid primary key,
    portal_user_id uuid not null references tara.portal_users(id) on delete cascade,
    tenant_id uuid not null,
    token_hash varchar(64) not null unique,
    purpose varchar(40) not null,
    expires_at timestamp not null,
    used_at timestamp,
    created_at timestamp not null default now()
);

create index if not exists ix_TARA__PORTal_tokens_lookup
    on tara.portal_tokens (token_hash, purpose, expires_at);

grant select, insert, update, delete on tara.portal_tokens to borgus;
