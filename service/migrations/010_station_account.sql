-- Vincula cada estação à conta consumidora responsável.
alter table tara.estacoes
    add column if not exists conta_id uuid;

-- A migration deve enxergar todos os tenants, independentemente do contexto
-- RLS da sessão usada pelo operador.
alter table tara.estacoes disable row level security;
alter table tara.contas disable row level security;

-- Estações legadas podem existir antes do cadastro da conta consumidora.
-- Cria uma conta técnica por tenant órfão para preservar esses registros.
insert into tara.contas (id, tenant_id, nome, status, created_at, updated_at)
select gen_random_uuid(), e.tenant_id,
       'Conta migrada ' || e.tenant_id::text, 'ATIVA', now(), now()
from tara.estacoes e
where e.conta_id is null
  and not exists (
      select 1 from tara.contas c where c.tenant_id = e.tenant_id
  )
group by e.tenant_id;

update tara.estacoes e
set conta_id = c.id
from tara.contas c
where c.tenant_id = e.tenant_id
  and e.conta_id is null;

do $$
begin
    if exists (select 1 from tara.estacoes where conta_id is null) then
        raise exception 'Não foi possível associar todas as estações a uma conta';
    end if;
end
$$;

alter table tara.estacoes
    alter column conta_id set not null;

do $$
begin
    if not exists (
        select 1 from pg_constraint
        where conname = 'fk_tara_estacoes_conta'
          and conrelid = 'tara.estacoes'::regclass
    ) then
        alter table tara.estacoes
            add constraint fk_tara_estacoes_conta
            foreign key (conta_id) references tara.contas(id) on delete cascade;
    end if;
end
$$;

alter table tara.contas enable row level security;
alter table tara.contas force row level security;
alter table tara.estacoes enable row level security;
alter table tara.estacoes force row level security;
