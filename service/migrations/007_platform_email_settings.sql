-- Configuração global de e-mail administrada pelo Backoffice da Plataforma.

create table if not exists balanca.platform_settings (
    key varchar(120) primary key,
    value text,
    is_secret boolean not null default false,
    updated_at timestamp not null default now(),
    updated_by uuid
);

grant usage on schema balanca to borgus;
grant select, insert, update, delete on balanca.platform_settings to borgus;
