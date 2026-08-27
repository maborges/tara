-- Segredos versionados para rotação sem indisponibilidade.
create table if not exists tara.api_client_secrets (
    id uuid primary key,
    api_client_id uuid not null references tara.api_clients(id) on delete cascade,
    tenant_id uuid not null,
    version integer not null,
    secret_hash varchar(64) not null,
    status varchar(20) not null default 'ATIVO',
    created_at timestamp not null default now(),
    valid_until timestamp null,
    last_used_at timestamp null,
    constraint uq_TARA_api_client_secret_version unique (api_client_id, version)
);

insert into tara.api_client_secrets (id, api_client_id, tenant_id, version, secret_hash, status, created_at)
select gen_random_uuid(), id, tenant_id, 1, secret_hash, status, created_at
from tara.api_clients c
where not exists (select 1 from tara.api_client_secrets s where s.api_client_id = c.id);

grant select, insert, update, delete on tara.api_client_secrets to borgus;
