-- Identidade estável da operação nascida na Station. Não cria uma entidade
-- paralela: a Ordem continua sendo o agregado canônico na Cloud.
alter table tara.ordens
    add column if not exists operation_local_id varchar(120);

create unique index if not exists uq_TARA_ordens_tenant_operation_local
    on tara.ordens (tenant_id, operation_local_id)
    where operation_local_id is not null;
