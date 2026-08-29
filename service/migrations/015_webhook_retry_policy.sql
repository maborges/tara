alter table tara.webhook_destinations
    add column if not exists max_attempts integer not null default 8,
    add column if not exists retry_base_seconds integer not null default 2;
alter table tara.webhook_destinations
    add constraint ck_TARA_webhook_max_attempts check (max_attempts between 1 and 50),
    add constraint ck_TARA_webhook_retry_base check (retry_base_seconds between 1 and 3600);
