-- Leitura agregada global para o dashboard do administrador da plataforma.
do $$
declare
    table_name text;
begin
    foreach table_name in array array['clientes','api_clients','estacoes','operadores','ordens','pesagens','eventos_outbox'] loop
        execute format('drop policy if exists %I_platform_admin on tara.%I', table_name, table_name);
        execute format(
            'create policy %I_platform_admin on tara.%I for select using (exists (select 1 from tara.administradores_plataforma admin where admin.usuario_id::text = nullif(current_setting(''app.platform_admin_id'', true), '''') and admin.status = ''ATIVO''))',
            table_name, table_name
        );
    end loop;
end $$;
