-- BALANCA-OPERATION-ORIGIN-01B
-- Origem explícita, estado de reconciliação da operação e auditoria.
-- A migration é aditiva: não preenche nem transforma registros históricos.

ALTER TABLE tara.ordens
    ALTER COLUMN referencia_externa DROP NOT NULL,
    ADD COLUMN IF NOT EXISTS origem_operacao VARCHAR(10),
    ADD COLUMN IF NOT EXISTS reconciliation_status VARCHAR(20);

CREATE INDEX IF NOT EXISTS ix_TARA_ordens_reconciliation
    ON tara.ordens (tenant_id, reconciliation_status);

CREATE UNIQUE INDEX IF NOT EXISTS uq_TARA_ordens_tenant_system_reference
    ON tara.ordens (tenant_id, sistema_cliente, referencia_externa)
    WHERE referencia_externa IS NOT NULL;

CREATE TABLE IF NOT EXISTS tara.ordem_reconciliacoes_auditoria (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL,
    ordem_id UUID NOT NULL REFERENCES tara.ordens(id) ON DELETE CASCADE,
    estado_anterior VARCHAR(20),
    estado_novo VARCHAR(20) NOT NULL,
    sistema_cliente VARCHAR(80),
    referencia_externa VARCHAR(180),
    decidido_em TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    ator_user_id UUID REFERENCES tara.usuarios(id),
    ator_client_id UUID REFERENCES tara.api_clients(id),
    motivo VARCHAR(500) NOT NULL,
    tipo_decisao VARCHAR(30) NOT NULL
);

CREATE INDEX IF NOT EXISTS ix_TARA_ordem_reconciliacao_auditoria_ordem
    ON tara.ordem_reconciliacoes_auditoria (tenant_id, ordem_id, decidido_em);

CREATE OR REPLACE FUNCTION tara.validar_ordem_reconciliacao_tenant()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    ordem_tenant uuid;
    user_tenant uuid;
    client_tenant uuid;
BEGIN
    SELECT tenant_id INTO ordem_tenant FROM tara.ordens WHERE id = NEW.ordem_id;
    IF ordem_tenant IS NULL OR ordem_tenant IS DISTINCT FROM NEW.tenant_id THEN
        RAISE EXCEPTION 'Auditoria de reconciliação deve pertencer ao tenant da Ordem';
    END IF;
    IF NEW.ator_user_id IS NOT NULL THEN
        SELECT tenant_id INTO user_tenant FROM tara.usuarios WHERE id = NEW.ator_user_id;
        IF user_tenant IS NULL OR user_tenant IS DISTINCT FROM NEW.tenant_id THEN
            RAISE EXCEPTION 'Ator usuário da reconciliação não pertence ao tenant';
        END IF;
    END IF;
    IF NEW.ator_client_id IS NOT NULL THEN
        SELECT tenant_id INTO client_tenant FROM tara.api_clients WHERE id = NEW.ator_client_id;
        IF client_tenant IS NULL OR client_tenant IS DISTINCT FROM NEW.tenant_id THEN
            RAISE EXCEPTION 'Ator cliente da reconciliação não pertence ao tenant';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_TARA_ordem_reconciliacao_tenant
    ON tara.ordem_reconciliacoes_auditoria;
CREATE TRIGGER trg_TARA_ordem_reconciliacao_tenant
BEFORE INSERT OR UPDATE ON tara.ordem_reconciliacoes_auditoria
FOR EACH ROW EXECUTE FUNCTION tara.validar_ordem_reconciliacao_tenant();

ALTER TABLE tara.ordem_reconciliacoes_auditoria ENABLE ROW LEVEL SECURITY;
ALTER TABLE tara.ordem_reconciliacoes_auditoria FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ordem_reconciliacoes_auditoria_tenant_isolation
    ON tara.ordem_reconciliacoes_auditoria;
CREATE POLICY ordem_reconciliacoes_auditoria_tenant_isolation
ON tara.ordem_reconciliacoes_auditoria
USING (tenant_id::text = NULLIF(current_setting('app.current_tenant_id', true), ''))
WITH CHECK (tenant_id::text = NULLIF(current_setting('app.current_tenant_id', true), ''));
