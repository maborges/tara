-- Permite autenticar API Clients e estações antes de conhecer o tenant.
-- O lookup continua protegido pelo RLS: somente a linha correspondente ao
-- identificador/hash apresentado pela própria requisição fica visível.

drop policy if exists api_clients_auth_lookup on tara.api_clients;
create policy api_clients_auth_lookup on tara.api_clients
    for select using (
        client_id = nullif(current_setting('app.auth_client_id', true), '')
    );

drop policy if exists estacoes_auth_lookup on tara.estacoes;
create policy estacoes_auth_lookup on tara.estacoes
    for select using (
        token_hash = nullif(current_setting('app.auth_station_token_hash', true), '')
    );
