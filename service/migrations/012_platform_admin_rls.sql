-- Permite que o administrador global consulte e edite contas de todos os tenants.
-- A autorização continua vinculada à identidade validada pela API; o GUC abaixo
-- nunca é aceito de headers ou do JWT sem a consulta prévia à tabela global.

drop policy if exists contas_platform_admin on tara.contas;
create policy contas_platform_admin on tara.contas
    using (
        exists (
            select 1
              from tara.administradores_plataforma admin
             where admin.usuario_id::text = nullif(current_setting('app.platform_admin_id', true), '')
               and admin.status = 'ATIVO'
        )
    )
    with check (
        exists (
            select 1
              from tara.administradores_plataforma admin
             where admin.usuario_id::text = nullif(current_setting('app.platform_admin_id', true), '')
               and admin.status = 'ATIVO'
        )
    );
