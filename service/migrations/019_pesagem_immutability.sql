-- A captura física é imutável. Reconciliação só altera vínculo e estado.
create or replace function tara.proteger_pesagem_confirmada()
returns trigger language plpgsql as $$
begin
    if tg_op = 'DELETE' then
        raise exception 'Pesagem confirmada é imutável e não pode ser removida';
    end if;
    if new.tenant_id is distinct from old.tenant_id
       or new.estacao_id is distinct from old.estacao_id
       or new.local_id is distinct from old.local_id
       or new.etapa is distinct from old.etapa
       or new.peso_informado_kg is distinct from old.peso_informado_kg
       or new.peso_aferido_kg is distinct from old.peso_aferido_kg
       or new.peso_tara_kg is distinct from old.peso_tara_kg
       or new.captured_via is distinct from old.captured_via
       or new.operador_id is distinct from old.operador_id
       or new.leitura_bruta is distinct from old.leitura_bruta
       or new.captured_at is distinct from old.captured_at
       or new.direcao_veiculo is distinct from old.direcao_veiculo
       or new.natureza_mercadoria is distinct from old.natureza_mercadoria
       or new.tipo_operacao is distinct from old.tipo_operacao
       or new.contexto is distinct from old.contexto then
        raise exception 'Captura física da pesagem é imutável';
    end if;
    return new;
end;
$$;

drop trigger if exists trg_TARA_pesagem_immutability on tara.pesagens;
create trigger trg_TARA_pesagem_immutability
before update or delete on tara.pesagens
for each row execute function tara.proteger_pesagem_confirmada();
