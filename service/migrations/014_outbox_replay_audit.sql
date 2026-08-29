create table if not exists tara.outbox_replay_audits (
    id uuid primary key,
    tenant_id uuid not null,
    outbox_id uuid not null references tara.eventos_outbox(id) on delete cascade,
    actor_user_id uuid not null,
    previous_status varchar(20) not null,
    reason varchar(240) not null,
    created_at timestamp not null default now()
);
create index if not exists ix_TARA_outbox_replay_audits_event on tara.outbox_replay_audits(tenant_id, outbox_id, created_at desc);
alter table tara.outbox_replay_audits enable row level security;
alter table tara.outbox_replay_audits force row level security;
drop policy if exists outbox_replay_audits_tenant_isolation on tara.outbox_replay_audits;
create policy outbox_replay_audits_tenant_isolation on tara.outbox_replay_audits
    using (tenant_id::text = nullif(current_setting('app.current_tenant_id', true), ''))
    with check (tenant_id::text = nullif(current_setting('app.current_tenant_id', true), ''));
grant select, insert on tara.outbox_replay_audits to borgus;
