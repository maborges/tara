-- Permite capturas sem ordem prévia, preservando o fato físico e seu contexto.
alter table tara.pesagens
    alter column ordem_id drop not null;

alter table tara.pesagens
    add column if not exists reconciliation_status varchar(30) not null default 'NAO_APLICAVEL',
    add column if not exists direcao_veiculo varchar(10),
    add column if not exists natureza_mercadoria varchar(10),
    add column if not exists tipo_operacao varchar(60),
    add column if not exists contexto jsonb not null default '{}'::jsonb;

create index if not exists ix_TARA_pesagens_reconciliation
    on tara.pesagens(tenant_id, reconciliation_status, captured_at);
