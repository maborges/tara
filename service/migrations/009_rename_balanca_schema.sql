-- Migra instalações existentes para o schema oficial da Plataforma TARA.
-- Em instalações novas, as migrations anteriores já criam o schema tara.
do $$
begin
    if to_regnamespace('tara') is null and to_regnamespace('balanca') is not null then
        alter schema balanca rename to tara;
    end if;
end
$$;
