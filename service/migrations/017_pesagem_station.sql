-- Preserva a estação física que originou cada captura de pesagem.
-- NULL mantém compatibilidade com pesagens manuais/importadas anteriores à migration.
alter table tara.pesagens
    add column if not exists estacao_id uuid;

do $$
begin
    if not exists (
        select 1 from pg_constraint
        where conname = 'fk_tara_pesagens_estacao'
          and conrelid = 'tara.pesagens'::regclass
    ) then
        alter table tara.pesagens
            add constraint fk_tara_pesagens_estacao
            foreign key (estacao_id) references tara.estacoes(id);
    end if;
end
$$;

create index if not exists ix_TARA_pesagens_station
    on tara.pesagens(tenant_id, estacao_id, captured_at);
