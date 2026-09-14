-- A identidade externa é da Conta e do cliente cadastrado; referências de
-- Ordens ficam isoladas por esse cliente, não apenas pelo sistema.
do $$
begin
    if exists (
        select 1 from pg_constraint
        where conname = 'uq_TARA_ordens_external'
          and conrelid = 'tara.ordens'::regclass
    ) then
        alter table tara.ordens drop constraint uq_TARA_ordens_external;
    end if;
    if not exists (
        select 1 from pg_constraint
        where conname = 'uq_TARA_ordens_client_external'
          and conrelid = 'tara.ordens'::regclass
    ) then
        alter table tara.ordens
            add constraint uq_TARA_ordens_client_external
            unique (cliente_id, referencia_externa);
    end if;
end $$;

do $$
begin
    if not exists (
        select 1 from pg_constraint
        where conname = 'uq_TARA_clientes_account_external'
          and conrelid = 'tara.clientes'::regclass
    ) then
        alter table tara.clientes
            add constraint uq_TARA_clientes_account_external
            unique (conta_id, sistema_cliente, tenant_cliente_id);
    end if;
end $$;
