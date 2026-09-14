-- O hash válido dos segredos versionados vive em api_client_secrets.
alter table tara.api_clients
    drop column if exists secret_hash;
