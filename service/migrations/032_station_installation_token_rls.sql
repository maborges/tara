-- Permite que uma instalação substituída sincronize sua fila pendente durante
-- o período de drenagem. O token por instalação é a credencial histórica;
-- estacoes.token_hash continua sendo a credencial da instalação corrente.
--
-- UP
drop policy if exists estacoes_auth_lookup on tara.estacoes;
create policy estacoes_auth_lookup on tara.estacoes
    for select using (
        token_hash = nullif(current_setting('app.auth_station_token_hash', true), '')
        or exists (
            select 1
            from tara.estacao_instalacoes ei
            where ei.estacao_id = estacoes.id
              and ei.token_hash = nullif(current_setting('app.auth_station_token_hash', true), '')
        )
    );

-- DOWN
-- Recria a política original (sem remover a coluna de credenciais históricas).
-- A ferramenta de migração executa este bloco apenas em downgrade explícito.
drop policy if exists estacoes_auth_lookup on tara.estacoes;
create policy estacoes_auth_lookup on tara.estacoes
    for select using (
        token_hash = nullif(current_setting('app.auth_station_token_hash', true), '')
    );
