-- Operadores podem ser desativados sem perda de histórico. O identificador
-- externo é único por tenant após remover espaços externos e ignorar caixa.
create unique index if not exists uq_TARA_operadores_external_normalized
    on tara.operadores (tenant_id, lower(btrim(identificador_externo)))
    where nullif(btrim(identificador_externo), '') is not null;
