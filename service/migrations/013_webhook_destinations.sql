-- Destino e segredo HMAC pertencem à Conta, não ao ambiente global.
create table if not exists tara.webhook_destinations (
    id uuid primary key,
    tenant_id uuid not null,
    conta_id uuid not null references tara.contas(id) on delete cascade,
    target_url varchar(500) not null,
    hmac_secret_encrypted text not null,
    status varchar(20) not null default 'ATIVO',
    event_types jsonb not null default '["balanca.pesagem.concluida.v1"]'::jsonb,
    created_at timestamp not null default now(),
    updated_at timestamp not null default now(),
    constraint uq_TARA_webhook_destination_account unique (conta_id)
);
create index if not exists ix_TARA_webhook_destinations_tenant on tara.webhook_destinations(tenant_id);
alter table tara.webhook_destinations enable row level security;
alter table tara.webhook_destinations force row level security;
drop policy if exists webhook_destinations_tenant_isolation on tara.webhook_destinations;
create policy webhook_destinations_tenant_isolation on tara.webhook_destinations
    using (tenant_id::text = nullif(current_setting('app.current_tenant_id', true), ''))
    with check (tenant_id::text = nullif(current_setting('app.current_tenant_id', true), ''));
grant select, insert, update, delete on tara.webhook_destinations to borgus;
